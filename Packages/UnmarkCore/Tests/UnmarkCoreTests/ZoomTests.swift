import Testing
import UnmarkCore

struct ZoomTests {
    @Test func twoZoomInsFromActualSizeReach125Percent() {
        let once = PreviewZoom.zoom(after: .zoomIn, from: PreviewZoom.actualSize)
        #expect(PreviewZoom.zoom(after: .zoomIn, from: once) == 1.25)
    }

    @Test func previewZoomStopsAtTheEndsOfTheSteps() {
        #expect(PreviewZoom.zoom(after: .zoomIn, from: 3.0) == 3.0)
        #expect(PreviewZoom.zoom(after: .zoomOut, from: 0.5) == 0.5)
    }

    @Test(arguments: [(ZoomStep.zoomIn, 1.1), (ZoomStep.zoomOut, 1.0)])
    func previewZoomBetweenStepsMovesToTheNearestStepThatWay(step: ZoomStep, expected: Double) {
        #expect(PreviewZoom.zoom(after: step, from: 1.05) == expected)
    }

    @Test func actualSizeResetsThePreviewToOne() {
        #expect(PreviewZoom.zoom(after: .actualSize, from: 2.5) == 1.0)
    }

    @Test(arguments: [
        (ZoomStep.zoomIn, 13.0, 14.0),
        (ZoomStep.zoomOut, 13.0, 12.0),
        (ZoomStep.zoomIn, 36.0, 36.0),
        (ZoomStep.zoomOut, 9.0, 9.0),
        (ZoomStep.actualSize, 20.0, 13.0),
    ])
    func sourceFontSizeStepsAPointWithinItsRange(step: ZoomStep, size: Double, expected: Double) {
        #expect(SourceFont.size(after: step, from: size) == expected)
    }
}
