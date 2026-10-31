import SwiftUI

@main
struct UnmarkApp: App {
    var body: some Scene {
        WindowGroup {
            Text("Open a markdown file to preview it.")
                .padding()
                .frame(minWidth: 480, minHeight: 320)
        }
    }
}
