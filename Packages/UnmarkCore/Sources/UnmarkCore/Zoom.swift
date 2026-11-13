/// View → Zoom In, Zoom Out, and Actual Size. They act on the focused pane only, and each pane's zoom is remembered
/// app-wide rather than per window or per document (q36, unmark-1793451439625-31-916af75a).
public enum ZoomStep: Sendable {
    case zoomIn, zoomOut, actualSize
}

/// The Preview's page zoom, `WKWebView.pageZoom`.
public enum PreviewZoom {
    public static let defaultsKey = "previewZoom"
    public static let actualSize = 1.0
    public static let steps = [0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]

    /// The step after `zoom` in the direction of `step`. A zoom between steps, such as one written to the defaults by
    /// hand, moves to the nearest step in that direction; at the end of the steps it stays put.
    public static func zoom(after step: ZoomStep, from zoom: Double) -> Double {
        switch step {
        case .zoomIn: steps.first { $0 > zoom } ?? zoom
        case .zoomOut: steps.last { $0 < zoom } ?? zoom
        case .actualSize: actualSize
        }
    }
}

/// The Source's font. Zooming the Source changes this size rather than a separate zoom factor, so Settings and zoom
/// edit the same value (q43).
public enum SourceFont {
    public static let sizeKey = "sourceFontSize"
    public static let defaultSize = 13.0
    public static let sizeRange = 9.0...36.0
    /// Chosen in Settings (q37, unmark-1793451442395-37-75cf72d7).
    public static let familyKey = "sourceFontFamily"
    /// The system's monospaced font, and the fallback for a chosen family that's no longer installed.
    public static let defaultFamily = "SF Mono"

    /// `size` a point larger or smaller, kept in `sizeRange`, or the default size for Actual Size.
    public static func size(after step: ZoomStep, from size: Double) -> Double {
        switch step {
        case .zoomIn: clamped(size + 1)
        case .zoomOut: clamped(size - 1)
        case .actualSize: defaultSize
        }
    }

    /// `size` kept in `sizeRange`, for a size typed into Settings as much as one zoomed to.
    public static func clamped(_ size: Double) -> Double {
        min(max(size, sizeRange.lowerBound), sizeRange.upperBound)
    }
}
