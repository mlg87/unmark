import Testing
import UnmarkCore

struct SourcePaneSideTests {
    @Test func nothingStoredIsTheLeft() {
        #expect(SourcePaneSide(defaultsValue: nil) == .left)
    }

    @Test func storedSideIsRead() {
        #expect(SourcePaneSide(defaultsValue: "left") == .left)
        #expect(SourcePaneSide(defaultsValue: "right") == .right)
    }

    @Test func valueThatNamesNoSideIsTheLeft() {
        #expect(SourcePaneSide(defaultsValue: "") == .left)
        #expect(SourcePaneSide(defaultsValue: "Right") == .left)
        #expect(SourcePaneSide(defaultsValue: "top") == .left)
    }

    /// `@AppStorage` and the View menu write the raw value, so it's what the defaults hold.
    @Test func storedValueIsTheRawValue() {
        for side in SourcePaneSide.allCases {
            #expect(SourcePaneSide(defaultsValue: side.rawValue) == side)
        }
    }

    @Test func oppositeSwitchesSides() {
        #expect(SourcePaneSide.left.opposite == .right)
        #expect(SourcePaneSide.right.opposite == .left)
    }
}
