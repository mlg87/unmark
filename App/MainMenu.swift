import AppKit

/// The menu bar, built in code because the AppKit lifecycle has no SwiftUI `commands` (ADR-0003).
@MainActor
enum MainMenu {
    static func make() -> NSMenu {
        let windowMenu = windowMenu()
        NSApp.windowsMenu = windowMenu

        let mainMenu = NSMenu()
        for submenu in [appMenu(), fileMenu(), editMenu(), windowMenu] {
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

    /// No New item: Unmark doesn't create files (q17). There's no hand-built Open Recent either: NSDocumentController
    /// inserts and maintains its own after the Open… item, and a second one built here showed up as a duplicate.
    private static func fileMenu() -> NSMenu {
        let menu = NSMenu(title: String(localized: "File"))
        menu.addItem(
            withTitle: String(localized: "Open…"), action: #selector(NSDocumentController.openDocument(_:)),
            keyEquivalent: "o")
        menu.addItem(.separator())

        menu.addItem(
            withTitle: String(localized: "Close"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
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
