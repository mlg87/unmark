import Foundation

/// A pane of Split mode.
public enum SplitPane: Sendable {
    case source, preview
}

/// Keeps Split mode's Source and Preview on the same source line, in both directions
/// (unmark-1793451437275-26-1e1952b0, q16). Each pane reports the 0-based source line at its top as it scrolls, and
/// the other pane follows.
///
/// Following scrolls the other pane, which reports that scroll too. So the pane the user scrolls owns the sync until
/// 150 ms after its latest scroll, and reports from the other pane meanwhile are its echoes, which are dropped.
/// Otherwise each pane would keep correcting the other, and scrolling would oscillate.
@MainActor
public final class ScrollSync {
    /// Long enough to cover the Preview's echo, which arrives a frame or two after the Source moves it, and short
    /// enough that the user can switch panes and scroll the other one right away.
    public static let ownershipDuration = Duration.milliseconds(150)

    /// Scrolls the Source so the given line, fractional within it, is at its top.
    public var scrollSource: (Double) -> Void = { _ in }
    /// Scrolls the Preview so the given line, fractional between the blocks around it, is at its top.
    public var scrollPreview: (Double) -> Void = { _ in }
    /// The 0-based source line at the Preview's top, or nil if the Preview can't tell yet.
    public var previewLineAtTop: @MainActor () async -> Double? = { nil }

    private let now: () -> ContinuousClock.Instant
    private var owner: SplitPane?
    private var ownedUntil = ContinuousClock.now

    public init(now: @escaping () -> ContinuousClock.Instant = { .now }) {
        self.now = now
    }

    /// `pane` scrolled so 0-based source `line` is at its top. Unless the other pane owns the sync, `pane` takes it
    /// and the other pane follows.
    public func paneDidScroll(_ pane: SplitPane, toLine line: Double) {
        let time = now()
        if let owner, owner != pane, time < ownedUntil { return }
        owner = pane
        ownedUntil = time + Self.ownershipDuration
        switch pane {
        case .source: scrollPreview(line)
        case .preview: scrollSource(line)
        }
    }

    /// Split mode showed the Source. Scroll sync moves a pane only after the other one scrolls, so the Source would
    /// start at the top wherever the Preview is; it follows the Preview's line at once instead
    /// (unmark-1793451427066-4-97884ee7.2). Going through `paneDidScroll` makes the Source's own scroll an echo, and a
    /// scroll the user starts in the Source before the Preview answers still wins.
    public func sourceDidAppear() async {
        guard let line = await previewLineAtTop() else { return }
        paneDidScroll(.preview, toLine: line)
    }
}
