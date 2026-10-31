# Build the document layer on an NSDocument subclass, not SwiftUI DocumentGroup

Unmark's documents are an `NSDocument` subclass (`MarkdownDocument`) with `autosavesInPlace` returning `false`. The app uses the AppKit app lifecycle, and each window hosts SwiftUI views in an `NSHostingController` created in `makeWindowControllers()`. A spike measured SwiftUI `DocumentGroup` + `FileDocument` against the behaviors Unmark depends on. It missed four of them: Open panel on empty launch (q21), auto-reload for editors that don't use file coordination (q7), a banner instead of silently replacing unsaved edits (q14), and no autosave (q13). The same harness, rebuilt on an `NSDocument` subclass, met all of them.

Environment: macOS 15.7.7 (24G720) on Intel, Swift 6.2.4, deployment target macOS 14.0. Each app logged every document read and write, editor-closure call, `NSFilePresenter` callback, and the state of `NSDocumentController`'s documents every 250 ms. Edits were real key events posted to the app's own queue and typed into a `TextEditor`. The harness lived on the throwaway branch `spike/document-group`.

## Observed: DocumentGroup + FileDocument

The scene was `DocumentGroup(newDocument:)` with `CommandGroup(replacing: .newItem) {}`.

### 1. Empty launch with New removed

- With default settings, an Untitled document window opened before `applicationDidFinishLaunching`, and no Open panel appeared.
- SwiftUI never calls `applicationShouldOpenUntitledFile(_:)` on an `@NSApplicationDelegateAdaptor` delegate, so "return `false` and call `NSDocumentController.shared.openDocument(nil)`" can't be wired up. `applicationShouldHandleReopen(_:hasVisibleWindows:)` is forwarded.
- Registering the undocumented AppKit default `NSShowAppCentricOpenPanelInsteadOfUntitledFile = true` in `App.init` showed the Open panel at launch with no Untitled document. Cancel left no windows, and the app kept running. A reopen event with no windows (`open -a`, the same event a Dock click sends) showed the panel again. We don't rely on it, because it isn't documented.

### 2. External change to an open `a.md`

| Write | Clean document | Unsaved edits | `NSFilePresenter` on `fileURL` |
| --- | --- | --- | --- |
| `echo x >> a.md` (uncoordinated, in place) | Not reloaded, not even after switching apps and back | Ignored | `presentedItemDidChange` 1.02–1.07 s after the write |
| Temp file + `mv` over `a.md` (atomic save) | Not reloaded | Ignored | 1.02–1.07 s |
| `NSFileCoordinator` write | Reloaded about 0.52 s after the write. `init(configuration:)` ran again, the editor closure ran again, and `onChange` fired | Silently reverted: `fileWrapper(configuration:)` wrote the user's text somewhere other than `a.md`, then the disk version replaced it in the window. No banner and no alert | 0.52 s, then a duplicate callback about 1.07 s later |

- A kqueue vnode source on the same path fired 1–3 ms after every write.
- Closing a window with unsaved edits wrote them to `a.md` with no Save prompt. SwiftUI's document class returns `true` for `autosavesInPlace`, and SwiftUI offers no way to change that.
- The presenter fired for every write style and every move. Once, while the document had unsaved edits, a coordinated read inside `presentedItemDidChange` returned without running its accessor block.

### 3. `fileURL`

- `fileURL` was non-nil for every opened document: two files passed to `open` at once, `openDocument(withContentsOf:display:)` (the path the Open panel and Open Recent use), and a path with spaces and non-ASCII characters.
- After a rename, the editor closure ran again with the new `fileURL`, and `EnvironmentValues.documentConfiguration?.fileURL` and the document's `fileURL` followed. Latency: about 1.06 s after `mv`, about 0.53 s after a coordinated move, about 0.55 s after a Finder rename.

### 4. Dirty versus clean

SwiftUI has no public dirty-state API. The private `NSDocument` subclass behind each window (`FileWrapperPlatformDocument`) reported `isDocumentEdited` correctly through `NSDocumentController.shared.documents`, while `NSWindow.isDocumentEdited` stayed `false`. So the app can tell the two states apart only by inspecting AppKit internals. Even then, DocumentGroup's own revert on coordinated writes runs before any banner could appear.

## Observed: NSDocument subclass

`MarkdownDocument: NSDocument` with `autosavesInPlace` returning `false`, an `NSApplicationDelegate`, and the same view in an `NSHostingController`.

- **Empty launch:** AppKit called `applicationShouldOpenUntitledFile(_:)`. Returning `false` and calling `openDocument(nil)` asynchronously showed the Open panel with no Untitled document. Cancel left no windows, and the app kept running. On a reopen event with no windows, `applicationShouldHandleReopen` called `openDocument(nil)` and showed the panel.
- **Clean document, external change:** the vnode source compared the file's `contentModificationDate` with `fileModificationDate`, then called `revert(toContentsOf:ofType:)`. The text updated 1–3 ms after in-place, atomic, and coordinated writes, and `isDocumentEdited` stayed `false`. The document's own `presentedItemDidChange` arrived 0.5–1.07 s later and was skipped because the dates matched.
- **Unsaved edits, external change:** the banner appeared and the user's text was kept, for both uncoordinated and coordinated writes. `NSDocument` didn't revert or prompt on its own.
- **Reload from Disk:** `revert(toContentsOf:ofType:)` plus `undoManager?.removeAllActions()` showed the disk text, with `isDocumentEdited` and `canUndo` both `false`.
- **Keep My Changes, then save:** after setting `fileModificationDate` to the file's current modification date, `save(_:)` wrote the user's text with no alert. Without that step, AppKit showed the sheet "This document's file has been changed by another application since you opened or saved it."
- **Closing with unsaved edits:** AppKit showed "Do you want to save the changes made to the document "a.md"?" with Save, Don't Save, and Cancel. The file was unchanged.
- **Rename:** `presentedItemDidMove(to:)` fired about 1.06 s after `mv` and immediately after a Finder rename, and it updated `fileURL` and the window title. `fileURL` changes asynchronously after `super` returns, so the watcher has to be re-armed on the URL passed to `presentedItemDidMove(to:)`, not on `fileURL`.
- **Delete with `rm`:** `NSDocument` got no callback. The only signal was the vnode source's `.delete` event with no file left at the path.

## Decision

- **Base type (#21):** an `NSDocument` subclass with `autosavesInPlace` returning `false`, an AppKit `NSApplicationDelegate` entry point, and SwiftUI content hosted through `makeWindowControllers()`. Empty launch and Dock reopen use `applicationShouldOpenUntitledFile(_:)` returning `false` and `applicationShouldHandleReopen(_:hasVisibleWindows:)`, both calling `NSDocumentController.shared.openDocument(nil)`.
- **External-change mechanism (#24, #28):** two sources feed one handler:
  - the document's own `NSFilePresenter` conformance: override `presentedItemDidChange()` and `presentedItemDidMove(to:)`, and call `super` in both;
  - a `DispatchSource.makeFileSystemObjectSource` vnode source on the file's path (`.write`, `.extend`, `.rename`, `.delete`), which reacts within milliseconds. The presenter alone takes about 1.05 s for uncoordinated writes, which misses #24's 500 ms target.

  The handler skips the event when the file's `contentModificationDate` equals `fileModificationDate`. Otherwise it calls `revert(toContentsOf:ofType:)` for a clean document and shows the banner for a document with unsaved edits. After `.rename` or `.delete`, a file still at the path means an atomic save: re-arm and reload. No file at the path means a move (wait for `presentedItemDidMove(to:)` and re-arm on its URL) or a delete.

## Considered Options

- **SwiftUI `DocumentGroup` + `FileDocument`** (the epic's original q13 choice): rejected for the observations above.
- **SwiftUI `DocumentGroup` + `ReferenceFileDocument`:** not measured. We expect the same SwiftUI-owned `NSDocument` machinery, with `autosavesInPlace` returning `true`, and so the same autosave and revert behavior.
- **`NSDocument` with `NSFilePresenter` only:** correct but slow. Uncoordinated writes, which most editors and `git` make, take about 1.05 s to arrive.

## Consequences

- `App/UnmarkApp.swift` changes from a SwiftUI `App` to an AppKit entry point. The main menu (Open…, Open Recent, Close, Save) is built in code, and the Settings window is hosted in an `NSWindow` because there is no SwiftUI `Settings` scene without the SwiftUI app lifecycle.
- The `NSDocument` subclass lives in the app target. `UnmarkCore` keeps platform-neutral pieces such as UTF-8 decoding.
- These results come from macOS 15.7. They were not re-run on macOS 14.
