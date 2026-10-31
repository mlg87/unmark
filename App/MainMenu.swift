import AppKit

/// The menu bar, built in code because the AppKit lifecycle has no SwiftUI `commands` (ADR-0003).
@MainActor
enum MainMenu {
    static func make() -> NSMenu {
        let windowMenu = windowMenu()
        NSApp.windowsMenu = windowMenu

        let mainMenu = NSMenu()
        for submenu in [appMenu(), fileMenu(), editMenu(), viewMenu(), windowMenu] {
            let item = NSMenuItem()
            item.submenu = submenu
            mainMenu.addItem(item)
        }
        return mainMenu
    }

    private static var appName: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
            ?? ProcessInfo.processInfo.processName
    }

    private static func appMenu() -> NSMenu {
        let menu = NSMenu(title: appName)
        menu.addItem(
            withTitle: String(localized: "About \(appName)"),
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        menu.addItem(.separator())

        let services = NSMenu(title: String(localized: "Services"))
        menu.addItem(withTitle: services.title, action: nil, keyEquivalent: "").submenu = services
        NSApp.servicesMenu = services
        menu.addItem(.separator())

        menu.addItem(
            withTitle: String(localized: "Hide \(appName)"), action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h")
        menu.addItem(
            withTitle: String(localized: "Hide Others"),
            action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h"
        ).keyEquivalentModifierMask = [.command, .option]
        menu.addItem(
            withTitle: String(localized: "Show All"), action: #selector(NSApplication.unhideAllApplications(_:)),
            keyEquivalent: "")
        menu.addItem(.separator())

        menu.addItem(
            withTitle: String(localized: "Quit \(appName)"), action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q")
        return menu
    }

    /// No New item: Unmark doesn't create files (q17), and so no Save As… either. There's no hand-built Open Recent:
    /// NSDocumentController inserts and maintains its own after the Open… item, and a second one built here showed up
    /// as a duplicate.
    private static func fileMenu() -> NSMenu {
        let menu = NSMenu(title: String(localized: "File"))
        menu.addItem(
            withTitle: String(localized: "Open…"), action: #selector(NSDocumentController.openDocument(_:)),
            keyEquivalent: "o")
        menu.addItem(.separator())

        menu.addItem(
            withTitle: String(localized: "Close"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        // Saving is explicit, there's no autosave (q13).
        menu.addItem(withTitle: String(localized: "Save"), action: #selector(NSDocument.save(_:)), keyEquivalent: "s")
        menu.addItem(
            withTitle: String(localized: "Revert to Saved"), action: #selector(NSDocument.revertToSaved(_:)),
            keyEquivalent: "")
        menu.addItem(.separator())

        menu.addItem(
            withTitle: String(localized: "Export as PDF…"), action: #selector(NSDocument.saveToPDF(_:)),
            keyEquivalent: "")
        menu.addItem(.separator())

        menu.addItem(
            withTitle: String(localized: "Page Setup…"), action: #selector(NSDocument.runPageLayout(_:)),
            keyEquivalent: "P")
        menu.addItem(
            withTitle: String(localized: "Print…"), action: #selector(NSDocument.printDocument(_:)), keyEquivalent: "p")
        return menu
    }

    private static func editMenu() -> NSMenu {
        let menu = NSMenu(title: String(localized: "Edit"))
        menu.addItem(withTitle: String(localized: "Undo"), action: Selector(("undo:")), keyEquivalent: "z")
        menu.addItem(withTitle: String(localized: "Redo"), action: Selector(("redo:")), keyEquivalent: "Z")
        menu.addItem(.separator())
        menu.addItem(withTitle: String(localized: "Cut"), action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        menu.addItem(withTitle: String(localized: "Copy"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        menu.addItem(withTitle: String(localized: "Paste"), action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        menu.addItem(
            withTitle: String(localized: "Select All"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        menu.addItem(.separator())
        menu.addItem(withTitle: String(localized: "Find"), action: nil, keyEquivalent: "").submenu = findMenu()
        return menu
    }

    /// Drives the Source's find bar (`usesFindBar`).
    private static func findMenu() -> NSMenu {
        let menu = NSMenu(title: String(localized: "Find"))
        func addItem(_ title: String, _ action: NSTextFinder.Action, keyEquivalent: String) {
            menu.addItem(
                withTitle: title, action: #selector(NSResponder.performTextFinderAction(_:)),
                keyEquivalent: keyEquivalent
            ).tag = action.rawValue
        }
        addItem(String(localized: "Find…"), .showFindInterface, keyEquivalent: "f")
        addItem(String(localized: "Find Next"), .nextMatch, keyEquivalent: "g")
        addItem(String(localized: "Find Previous"), .previousMatch, keyEquivalent: "G")
        addItem(String(localized: "Use Selection for Find"), .setSearchString, keyEquivalent: "e")
        return menu
    }

    private static func viewMenu() -> NSMenu {
        let menu = NSMenu(title: String(localized: "View"))
        // `DocumentWindowController` retitles it to Hide Source while its window is in Split mode.
        menu.addItem(
            withTitle: DocumentWindowController.toggleSourceTitle(sourceVisible: false),
            action: #selector(DocumentWindowController.toggleSource(_:)), keyEquivalent: "E")
        return menu
    }

    private static func windowMenu() -> NSMenu {
        let menu = NSMenu(title: String(localized: "Window"))
        menu.addItem(
            withTitle: String(localized: "Minimize"), action: #selector(NSWindow.performMiniaturize(_:)),
            keyEquivalent: "m")
        menu.addItem(
            withTitle: String(localized: "Zoom"), action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(
            withTitle: String(localized: "Bring All to Front"), action: #selector(NSApplication.arrangeInFront(_:)),
            keyEquivalent: "")
        return menu
    }
}
