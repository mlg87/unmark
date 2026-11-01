/// What the Preview's renderer posts to the app through `window.webkit.messageHandlers.unmark`
/// (unmark-1793451437275-26-1e1952b0). Bodies arrive as WebKit's conversion of a JavaScript value, so they're
/// parsed without assuming their shape.
public enum PreviewMessage: Equatable, Sendable {
    /// The name the renderer's script message handler is registered under.
    public static let handlerName = "unmark"

    /// The user scrolled the Preview; `line` is the 0-based source line at its top, fractional between blocks.
    case previewScrolled(line: Double)

    public init?(body: Any) {
        guard let body = body as? [String: Any], body["type"] as? String == "previewScrolled",
            let line = body["line"] as? Double, line.isFinite
        else { return nil }
        self = .previewScrolled(line: line)
    }
}
