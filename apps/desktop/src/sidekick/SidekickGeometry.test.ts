import { describe, expect, it } from "vite-plus/test";

import {
  defaultSidekickPosition,
  resizeSidekickPosition,
  resolveSidekickPosition,
} from "./SidekickGeometry.ts";

const PRIMARY = { x: 0, y: 25, width: 1440, height: 875 };
const LEFT = { x: -1920, y: 0, width: 1920, height: 1080 };

describe("resolveSidekickPosition", () => {
  it("defaults to the primary display's bottom-right corner", () => {
    expect(
      resolveSidekickPosition({
        saved: null,
        size: 136,
        workAreas: [PRIMARY],
        primaryWorkArea: PRIMARY,
      }),
    ).toEqual({ x: 1440 - 136 - 24, y: 25 + 875 - 136 - 24 });
  });

  it("keeps a saved position on a secondary display", () => {
    expect(
      resolveSidekickPosition({
        saved: { x: -800, y: 300 },
        size: 136,
        workAreas: [PRIMARY, LEFT],
        primaryWorkArea: PRIMARY,
      }),
    ).toEqual({ x: -800, y: 300 });
  });

  it("pulls a partially off-screen position back inside its display", () => {
    expect(
      resolveSidekickPosition({
        saved: { x: 1380, y: 0 },
        size: 96,
        workAreas: [PRIMARY],
        primaryWorkArea: PRIMARY,
      }),
    ).toEqual({ x: 1440 - 96, y: 25 });
  });

  it("falls back to the default when the saved display is gone", () => {
    expect(
      resolveSidekickPosition({
        saved: { x: -800, y: 300 },
        size: 136,
        workAreas: [PRIMARY],
        primaryWorkArea: PRIMARY,
      }),
    ).toEqual(defaultSidekickPosition(PRIMARY, 136));
  });
});

describe("resizeSidekickPosition", () => {
  it("keeps the sprite centered across size changes", () => {
    expect(resizeSidekickPosition({ x: 100, y: 100 }, 136, 184)).toEqual({ x: 76, y: 76 });
    expect(resizeSidekickPosition({ x: 76, y: 76 }, 184, 136)).toEqual({ x: 100, y: 100 });
  });
});
