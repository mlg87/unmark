import { describe, expect, test } from "vitest";
import { pickRelease } from "../scripts/release.ts";

const DMG_URL = "https://github.com/mlg87/unmark/releases/download/v0.1.0/Unmark-0.1.0.dmg";

function release(tag_name: string, assetNames: string[]) {
  return {
    tag_name,
    assets: assetNames.map((name) => ({
      name,
      browser_download_url: `https://github.com/mlg87/unmark/releases/download/${tag_name}/${name}`,
    })),
  };
}

describe("pickRelease", () => {
  test("returns the version and DMG URL of a release shaped like v0.1.0", () => {
    expect(pickRelease(release("v0.1.0", ["appcast.xml", "Unmark-0.1.0.dmg"]))).toEqual({
      version: "0.1.0",
      dmgUrl: DMG_URL,
    });
  });

  test("throws when the release has no DMG", () => {
    expect(() => pickRelease(release("v0.1.0", ["appcast.xml"]))).toThrow(
      "No Unmark-*.dmg asset in release v0.1.0",
    );
  });

  test("keeps a prerelease suffix in the version", () => {
    expect(pickRelease(release("v1.2.3-rc1", ["Unmark-1.2.3-rc1.dmg"])).version).toBe("1.2.3-rc1");
  });
});
