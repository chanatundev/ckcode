import { describe, expect, it } from "vite-plus/test";

import {
  defaultSidekickPosition,
  expandSidekickBounds,
  resizeSidekickPosition,
  resolveSidekickPosition,
  SIDEKICK_ROW_DIMENSIONS,
  SIDEKICK_SIZE_PX,
} from "./SidekickGeometry.ts";

const PRIMARY = { x: 0, y: 25, width: 1440, height: 875 };
const LEFT = { x: -1920, y: 0, width: 1920, height: 1080 };

describe("SIDEKICK_ROW_DIMENSIONS", () => {
  it("links thread row dimensions monotonically to sidekick size", () => {
    const { small, medium, large } = SIDEKICK_ROW_DIMENSIONS;

    expect(small.rowHeight).toBeLessThan(medium.rowHeight);
    expect(medium.rowHeight).toBeLessThan(large.rowHeight);

    expect(small.panelWidth).toBeLessThan(medium.panelWidth);
    expect(medium.panelWidth).toBeLessThan(large.panelWidth);

    expect(small.rowFontSize).toBeLessThan(medium.rowFontSize);
    expect(medium.rowFontSize).toBeLessThan(large.rowFontSize);

    expect(small.moreHeight).toBeLessThan(medium.moreHeight);
    expect(medium.moreHeight).toBeLessThan(large.moreHeight);
  });

  it("defines dimensions for every supported sidekick size", () => {
    for (const size of Object.keys(SIDEKICK_SIZE_PX) as (keyof typeof SIDEKICK_SIZE_PX)[]) {
      const dimensions = SIDEKICK_ROW_DIMENSIONS[size];
      expect(dimensions).toBeDefined();
      expect(dimensions.panelWidth).toBeGreaterThan(0);
      expect(dimensions.rowHeight).toBeGreaterThan(0);
      expect(dimensions.rowFontSize).toBeGreaterThan(0);
      expect(dimensions.arrowSize).toBeGreaterThan(0);
    }
  });
});

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

  it("snaps a drag released over the menu bar or between displays to the nearest edge", () => {
    expect(
      resolveSidekickPosition({
        saved: { x: 600, y: -60 },
        size: 96,
        workAreas: [PRIMARY, LEFT],
        primaryWorkArea: PRIMARY,
      }),
    ).toEqual({ x: 600, y: 25 });
    expect(
      resolveSidekickPosition({
        saved: { x: -40, y: 1000 },
        size: 96,
        workAreas: [PRIMARY, LEFT],
        primaryWorkArea: PRIMARY,
      }),
    ).toEqual({ x: -96, y: 1080 - 96 });
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

describe("expandSidekickBounds", () => {
  const panel = { width: 280, height: 150 };

  it("opens above and to the left from the default bottom-right corner", () => {
    const sprite = defaultSidekickPosition(PRIMARY, 136);
    const { bounds, layout } = expandSidekickBounds({
      sprite,
      size: 136,
      panel,
      workArea: PRIMARY,
    });
    expect(layout).toEqual({ placement: "above", align: "end" });
    // The sprite keeps its screen position in the bottom-right of the window.
    expect(bounds.x + bounds.width).toBe(sprite.x + 136);
    expect(bounds.y + bounds.height).toBe(sprite.y + 136);
    expect(bounds).toMatchObject({ width: 280, height: 136 + 10 + 150 });
  });

  it("opens below when the list would not fit above", () => {
    const sprite = { x: 40, y: PRIMARY.y + 60 };
    const { bounds, layout } = expandSidekickBounds({
      sprite,
      size: 136,
      panel,
      workArea: PRIMARY,
    });
    expect(layout).toEqual({ placement: "below", align: "start" });
    expect(bounds).toMatchObject({ x: sprite.x, y: sprite.y });
  });

  it("is never narrower than the sprite", () => {
    const { bounds } = expandSidekickBounds({
      sprite: { x: 40, y: 600 },
      size: 184,
      panel: { width: 120, height: 40 },
      workArea: PRIMARY,
    });
    expect(bounds.width).toBe(184);
  });

  it("expands appropriately for linked panel widths for each sidekick size", () => {
    for (const size of Object.keys(SIDEKICK_SIZE_PX) as (keyof typeof SIDEKICK_SIZE_PX)[]) {
      const spriteSize = SIDEKICK_SIZE_PX[size];
      const { panelWidth } = SIDEKICK_ROW_DIMENSIONS[size];
      const sprite = defaultSidekickPosition(PRIMARY, spriteSize);
      const { bounds } = expandSidekickBounds({
        sprite,
        size: spriteSize,
        panel: { width: panelWidth, height: 120 },
        workArea: PRIMARY,
      });
      expect(bounds.width).toBe(panelWidth);
      expect(bounds.height).toBe(spriteSize + 10 + 120);
    }
  });
});
