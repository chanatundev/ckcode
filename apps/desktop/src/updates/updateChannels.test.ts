import { describe, expect, it } from "vite-plus/test";

import {
  isNightlyDesktopVersion,
  isPrereleaseDesktopVersion,
  resolveDefaultDesktopUpdateChannel,
} from "./updateChannels.ts";

describe("updateChannels", () => {
  it("keeps preview builds branded as nightly but on the latest update channel", () => {
    expect(isNightlyDesktopVersion("0.0.41-preview.20260911.7")).toBe(true);
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-preview.20260911.7")).toBe("latest");
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-nightly.20260911.7")).toBe("nightly");
  });

  it("only matches the first prerelease identifier", () => {
    expect(isNightlyDesktopVersion("1.2.3-foo-preview.20260911.1")).toBe(false);
    expect(isNightlyDesktopVersion("1.2.3")).toBe(false);
  });

  it("treats any semver prerelease as ineligible for stable updates", () => {
    expect(isPrereleaseDesktopVersion("0.0.42")).toBe(false);
    expect(isPrereleaseDesktopVersion("0.0.42+build.1")).toBe(false);
    expect(isPrereleaseDesktopVersion("0.0.43-nightly.20260911.7")).toBe(true);
    expect(isPrereleaseDesktopVersion("0.0.43-rc.1")).toBe(true);
  });
});
