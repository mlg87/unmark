export interface Release {
  version: string;
  dmgUrl: string;
}

const LATEST_RELEASE_URL = "https://api.github.com/repos/mlg87/unmark/releases/latest";
const DMG_ASSET = /^Unmark-.+\.dmg$/;

interface ReleaseResponse {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

export function pickRelease(apiResponse: unknown): Release {
  const { tag_name, assets } = apiResponse as ReleaseResponse;
  const dmg = assets.find((asset) => DMG_ASSET.test(asset.name));
  if (!dmg) {
    throw new Error(`No Unmark-*.dmg asset in release ${tag_name}`);
  }
  return { version: tag_name.replace(/^v/, ""), dmgUrl: dmg.browser_download_url };
}

export async function fetchLatestRelease(): Promise<Release> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  // CI passes its token so builds share the authenticated rate limit, not the runner IP's.
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(LATEST_RELEASE_URL, { headers });
  if (response.status !== 200) {
    throw new Error(`GitHub releases/latest returned ${response.status}`);
  }
  return pickRelease(await response.json());
}
