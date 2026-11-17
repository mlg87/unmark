import UnmarkCore
import WebKit

// Links (#23, unmark-eg8). The Preview's web view never leaves the renderer page: every link the user follows goes to
// `linkActivated` instead, however they follow it.
extension PreviewView.Coordinator: WKUIDelegate {
    /// The link `navigationAction` follows, or nil for a load the web view makes itself, such as the renderer page's.
    /// A click arrives as `.linkActivated`, but Open Link in the context menu and a file dropped on the Preview
    /// don't, so `LinkRouter.navigation` goes by where the navigation leads.
    func linkFollowed(by navigationAction: WKNavigationAction) -> URL? {
        guard let url = navigationAction.request.url,
            case .followLink(let link) = LinkRouter.navigation(
                to: url, isLinkClick: navigationAction.navigationType == .linkActivated,
                // A navigation with no target frame asks for a new window, which the Preview never opens.
                inMainFrame: navigationAction.targetFrame?.isMainFrame ?? true)
        else { return nil }
        return link
    }

    /// Open Link in New Window in the context menu asks for a web view to show the link in. The link goes where a
    /// click sends it instead, and no web view is made: a markdown file opens in a document window of its own.
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            linkActivated(url)
        }
        return nil
    }
}
