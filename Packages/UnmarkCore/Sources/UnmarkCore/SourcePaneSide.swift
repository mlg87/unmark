/// The side of the Preview the Source is on in Split mode: one choice for every window, remembered across launches
/// (unmark-ilr). The Source starts on the left.
public enum SourcePaneSide: String, CaseIterable, Sendable {
    case left, right

    public static let defaultsKey = "sourcePaneSide"

    /// The side a value read from the defaults names. Nothing stored yet, or a value written by hand that names no
    /// side, is the left.
    public init(defaultsValue: String?) {
        self = defaultsValue.flatMap(Self.init(rawValue:)) ?? .left
    }

    /// The other side, which View → Source on Right switches to.
    public var opposite: SourcePaneSide {
        switch self {
        case .left: .right
        case .right: .left
        }
    }
}
