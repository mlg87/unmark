/// One row of the Outline: a heading of the rendered document, in document order
/// (unmark-1793451438713-29-a6ce6672). `id` is the heading's element id in the Preview, unique within the document.
public struct OutlineHeading: Equatable, Identifiable, Sendable {
    /// 1 for an H1 through 6 for an H6.
    public let level: Int
    public let text: String
    public let id: String

    public init(level: Int, text: String, id: String) {
        self.level = level
        self.text = text
        self.id = id
    }

    /// Parses the renderer's outline, an array of `Heading`s, as WebKit hands it over. One malformed heading drops the
    /// whole outline rather than leaving the Outline a row short.
    static func outline(body: Any?) -> [OutlineHeading]? {
        guard let bodies = body as? [Any] else { return nil }
        let headings = bodies.compactMap(OutlineHeading.init(body:))
        return headings.count == bodies.count ? headings : nil
    }

    /// Parses one of the renderer's `Heading`s, `{ level, text, id }`.
    private init?(body: Any) {
        guard let body = body as? [String: Any], let level = body["level"] as? Int, (1...6).contains(level),
            let text = body["text"] as? String, let id = body["id"] as? String
        else { return nil }
        self.init(level: level, text: text, id: id)
    }
}
