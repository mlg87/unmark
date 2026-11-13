// Times the renderer's share of q47's keystroke-to-preview (under 250 ms for a 1 MB file) in a real WKWebView, with
// WebKit's layout and paint, for comparison with renderer/test/keystroke-to-preview.test.ts's jsdom figure
// (unmark-1793451427523-5-478d1806.8). It types the way that test does, into the same 1 MB document, and calls the
// renderer the way PreviewView does: the whole text through `callAsyncJavaScript` on every keystroke.
//
// usage: sh scripts/build-renderer.sh && swift scripts/perf/keystroke-to-preview.swift [options]
//   --width W --height H  the Preview's size in points (default 360x760: the Preview in Split mode at the
//                         document window's default 720x800)
//   --cold                skip the warm-up edits on a small document, so the first keystroke compiles the edit path
//   --interval MS         wait MS between keystrokes (default 0, back to back as the jsdom test types)
//
// The window must be visible and the app active for the whole run: WebKit throttles the timers of a page in a
// window that isn't, and the renderer's background work then stalls `outline()` after the open. The script
// activates itself; leave the window in front until it exits. Not part of CI: a GitHub runner has no window server
// session to activate in.
import AppKit
import WebKit

struct Options {
    var width = 360.0
    var height = 760.0
    var warmUp = true
    var interval = 0.0
}

func parseOptions() -> Options {
    var options = Options()
    var arguments = CommandLine.arguments.dropFirst().makeIterator()
    func number(after flag: String) -> Double {
        guard let value = arguments.next().flatMap(Double.init) else {
            FileHandle.standardError.write(Data("keystroke-to-preview: \(flag) needs a number\n".utf8))
            exit(2)
        }
        return value
    }
    while let argument = arguments.next() {
        switch argument {
        case "--width": options.width = number(after: argument)
        case "--height": options.height = number(after: argument)
        case "--interval": options.interval = number(after: argument)
        case "--cold": options.warmUp = false
        default:
            FileHandle.standardError.write(Data("keystroke-to-preview: unknown option \(argument)\n".utf8))
            exit(2)
        }
    }
    return options
}

let options = parseOptions()
let repository = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent()
let rendererDirectory = repository.appending(path: "App/Resources/Renderer", directoryHint: .isDirectory)
guard FileManager.default.fileExists(atPath: rendererDirectory.appending(path: "unmark.js").path) else {
    FileHandle.standardError.write(Data("keystroke-to-preview: run scripts/build-renderer.sh first\n".utf8))
    exit(2)
}

// A script can't import UnmarkCore, so these mirror PreviewURL and DocumentWindow.editRenderDebounce.
let rendererPage = URL(string: "unmark://app/renderer/index.html")!
let rendererScript = "unmark://app/renderer/unmark.js"
let editRenderDebounceMs = 40.0
let keystrokeToPreviewMs = 250.0

/// Serves `unmark://app/renderer/` from App/Resources/Renderer/, as UnmarkSchemeHandler does.
final class RendererSchemeHandler: NSObject, WKURLSchemeHandler {
    static let mimeTypes = ["html": "text/html", "js": "text/javascript", "css": "text/css", "woff2": "font/woff2"]

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let url = task.request.url!
        let path = url.path(percentEncoded: false)
        let file = rendererDirectory.appending(path: String(path.dropFirst("/renderer/".count)))
        guard path.hasPrefix("/renderer/"), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
            task.didFinish()
            return
        }
        let mimeType = Self.mimeTypes[file.pathExtension] ?? "application/octet-stream"
        let headers = ["Content-Type": mimeType, "Content-Length": String(data.count)]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

final class PageLoad: NSObject, WKNavigationDelegate {
    var continuation: CheckedContinuation<Void, Never>?

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        continuation?.resume()
        continuation = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        FileHandle.standardError.write(Data("keystroke-to-preview: page failed to load: \(error)\n".utf8))
        exit(1)
    }
}

/// renderer/test/keystroke-to-preview.test.ts's `section`, so both type into the same document.
func section(_ number: Int) -> String {
    """
    ## Part \(number)

    Text with a [link](https://example.com/\(number)), www.example.com, and more words here.

    | a | b |
    | :-- | --: |
    | \(number) | x |

    - [x] done
    - [ ] not done

    ```js
    const n = \(number);
    ```

    > [!NOTE]
    > An alert.

    Another paragraph \(number) with **bold** and _emphasis_ and `code`.

    """
}

/// renderer/test/keystroke-to-preview.test.ts's `documentOf`: sections numbered from `first` until the document is
/// `length` characters long.
func documentOf(length: Int, first: Int) -> String {
    var markdown = ""
    var number = first
    while markdown.utf16.count < length {
        markdown += "\(section(number))\n"
        number += 1
    }
    return markdown
}

struct Keystroke {
    /// `window.unmark.render` alone, as the page clocks it: the figure the jsdom test measures.
    let renderMs: Double
    /// From the render's end until the frame showing it has been painted.
    let paintMs: Double
    /// `callAsyncJavaScript` as PreviewView makes it, 1 MB of text included, less `paintMs`: what the app's
    /// `render` signpost spans.
    let callMs: Double
}

func median(_ values: [Double]) -> Double {
    values.sorted()[values.count / 2]
}

func format(_ values: [Double]) -> String {
    values.map { String(Int($0.rounded())) }.joined(separator: ", ")
}

func milliseconds(since start: ContinuousClock.Instant) -> Double {
    let elapsed = start.duration(to: .now).components
    return Double(elapsed.seconds) * 1000 + Double(elapsed.attoseconds) / 1e15
}

@MainActor
final class Harness {
    let webView: WKWebView
    let documentBaseURL = repository.absoluteString

    init(webView: WKWebView) {
        self.webView = webView
    }

    /// PreviewView's render call, which also clocks the render and the paint after it.
    func render(_ markdown: String) async throws -> Keystroke {
        let start = ContinuousClock.now
        let result = try await webView.callAsyncJavaScript(
            """
            const start = performance.now();
            if (!window.unmark) await import(rendererScript);
            await window.unmark.render(markdown, { documentBaseURL });
            const rendered = performance.now();
            // A task queued from requestAnimationFrame runs after that frame's layout and paint.
            await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
            return [rendered - start, performance.now() - rendered];
            """,
            arguments: ["rendererScript": rendererScript, "markdown": markdown, "documentBaseURL": documentBaseURL],
            contentWorld: .page)
        let total = milliseconds(since: start)
        guard let times = result as? [Double], times.count == 2 else {
            throw HarnessError("render returned \(result ?? "nil")")
        }
        return Keystroke(renderMs: times[0], paintMs: times[1], callMs: total - times[1])
    }

    /// The jsdom test's `openAndType`: opens `markdown`, waits for all of it to be on the page, scrolls `edited` to
    /// 300 points below the top, and types `x` after it.
    func openAndType(_ markdown: String, edited: String, keystrokes: Int) async throws -> [Keystroke] {
        let open = try await render(markdown)
        let outlineStart = ContinuousClock.now
        _ = try await webView.callAsyncJavaScript("await window.unmark.outline();", contentWorld: .page)
        let outlinedMs = Int(milliseconds(since: outlineStart).rounded())
        print("  open: render \(Int(open.renderMs.rounded())) ms, whole page built \(outlinedMs) ms later")
        let scrolled = try await webView.callAsyncJavaScript(
            """
            const article = document.querySelector("article.markdown-body");
            const paragraph = [...article.children].find((block) => block.textContent.startsWith(edited));
            if (!paragraph) return false;
            window.scrollTo(0, paragraph.getBoundingClientRect().top + window.scrollY - 300);
            await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
            return true;
            """, arguments: ["edited": edited], contentWorld: .page)
        guard scrolled as? Bool == true else { throw HarnessError("no paragraph starts with \(edited)") }

        var text = markdown
        let caret = (text as NSString).range(of: edited).upperBound
        var typed: [Keystroke] = []
        for count in 0..<keystrokes {
            if options.interval > 0 { try await Task.sleep(for: .milliseconds(options.interval)) }
            text = (text as NSString).replacingCharacters(in: NSRange(location: caret + count, length: 0), with: "x")
            typed.append(try await render(text))
        }
        let shown = try await webView.callAsyncJavaScript(
            """
            const article = document.querySelector("article.markdown-body");
            return [...article.children].some((block) => block.textContent.startsWith(typedIn));
            """, arguments: ["typedIn": "\(edited)\(String(repeating: "x", count: keystrokes)) with"],
            contentWorld: .page)
        guard shown as? Bool == true else { throw HarnessError("the typed text never reached the page") }
        return typed
    }
}

struct HarnessError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

func describeMachine(window: NSWindow) -> String {
    func sysctl(_ name: String) -> String {
        var size = 0
        sysctlbyname(name, nil, &size, nil, 0)
        var value = [CChar](repeating: 0, count: size)
        sysctlbyname(name, &value, &size, nil, 0)
        return String(cString: value)
    }
    let webKit = Bundle(for: WKWebView.self).infoDictionary?["CFBundleVersion"] as? String ?? "?"
    return """
        \(sysctl("hw.model")), \(sysctl("machdep.cpu.brand_string")), \
        macOS \(ProcessInfo.processInfo.operatingSystemVersionString), WebKit \(webKit)
        Preview \(Int(options.width))x\(Int(options.height)) pt at \(window.backingScaleFactor)x, \
        app active: \(NSApp.isActive), window key: \(window.isKeyWindow), \
        warm-up: \(options.warmUp), interval: \(Int(options.interval)) ms
        """
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let activity = ProcessInfo.processInfo.beginActivity(
    options: [.userInitiated, .latencyCritical], reason: "Timing keystroke-to-preview")

let configuration = WKWebViewConfiguration()
configuration.setURLSchemeHandler(RendererSchemeHandler(), forURLScheme: "unmark")
let webView = WKWebView(
    frame: NSRect(x: 0, y: 0, width: options.width, height: options.height),
    configuration: configuration)
let window = NSWindow(
    contentRect: webView.frame, styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
window.title = "keystroke-to-preview"
window.contentView = webView
window.center()
let pageLoad = PageLoad()
webView.navigationDelegate = pageLoad

Task { @MainActor in
    window.makeKeyAndOrderFront(nil)
    app.activate(ignoringOtherApps: true)
    await withCheckedContinuation { continuation in
        pageLoad.continuation = continuation
        webView.load(URLRequest(url: rendererPage))
    }
    let harness = Harness(webView: webView)
    do {
        print(describeMachine(window: window))
        if options.warmUp {
            // The jsdom test's warm-up: a small document, numbered apart from the measured one, takes the first edits.
            print("warm-up, 50 KB:")
            let warm = try await harness.openAndType(
                documentOf(length: 50_000, first: 100_000), edited: "Another paragraph 100100", keystrokes: 3)
            print("  keystroke render: \(format(warm.map(\.renderMs))) ms")
        }
        let opened = documentOf(length: 1_000_000, first: 0)
        print("measured, \(opened.utf16.count) characters:")
        let typed = try await harness.openAndType(opened, edited: "Another paragraph 1200", keystrokes: 7)
        let render = typed.map(\.renderMs)
        let painted = typed.map { $0.renderMs + $0.paintMs }
        let call = typed.map(\.callMs)
        let shown = typed.map { $0.callMs + $0.paintMs }
        print("  render (jsdom test's figure):     \(format(render)) ms, median \(Int(median(render).rounded()))")
        print("  render to painted:                \(format(painted)) ms, median \(Int(median(painted).rounded()))")
        print("  PreviewView's call (1 MB text):   \(format(call)) ms, median \(Int(median(call).rounded()))")
        print("  call to painted:                  \(format(shown)) ms, median \(Int(median(shown).rounded()))")
        let budget = keystrokeToPreviewMs - editRenderDebounceMs
        print("  q47 budget after the \(Int(editRenderDebounceMs)) ms debounce: \(Int(budget)) ms")
        print("still active at the end: app \(NSApp.isActive), window key \(window.isKeyWindow)")
        ProcessInfo.processInfo.endActivity(activity)
        exit(0)
    } catch {
        FileHandle.standardError.write(Data("keystroke-to-preview: \(error)\n".utf8))
        exit(1)
    }
}
app.run()
