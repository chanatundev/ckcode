import type { DesktopSidekickSize } from "@t3tools/contracts";

import type { DesktopSidekickPosition } from "../settings/DesktopAppSettings.ts";

/** Square window edge per size, in DIPs. */
export const SIDEKICK_SIZE_PX: Record<DesktopSidekickSize, number> = {
  small: 96,
  medium: 136,
  large: 184,
};

const SCREEN_MARGIN_PX = 24;

export interface SidekickRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Bottom-right corner of the work area, clear of the Dock/taskbar. */
export function defaultSidekickPosition(workArea: SidekickRect, size: number) {
  return clampIntoWorkArea(
    {
      x: workArea.x + workArea.width - size - SCREEN_MARGIN_PX,
      y: workArea.y + workArea.height - size - SCREEN_MARGIN_PX,
    },
    size,
    workArea,
  );
}

function clampIntoWorkArea(
  position: DesktopSidekickPosition,
  size: number,
  workArea: SidekickRect,
): DesktopSidekickPosition {
  const clamp = (value: number, start: number, extent: number) =>
    Math.round(Math.max(start, Math.min(value, start + Math.max(0, extent - size))));
  return {
    x: clamp(position.x, workArea.x, workArea.width),
    y: clamp(position.y, workArea.y, workArea.height),
  };
}

/** Distance from a point to a rect; zero when the point is inside it. */
function distanceToWorkArea(x: number, y: number, area: SidekickRect) {
  const dx = Math.max(area.x - x, 0, x - (area.x + area.width));
  const dy = Math.max(area.y - y, 0, y - (area.y + area.height));
  return Math.hypot(dx, dy);
}

/**
 * Pulls a saved position fully inside the work area nearest the sidekick's
 * center, so a drag released past an edge, over the menu bar, or between
 * monitors snaps to the closest edge. A position far from every display (its
 * monitor was unplugged) falls back to the primary display's default corner.
 */
export function resolveSidekickPosition(input: {
  readonly saved: DesktopSidekickPosition | null;
  readonly size: number;
  readonly workAreas: readonly SidekickRect[];
  readonly primaryWorkArea: SidekickRect;
}): DesktopSidekickPosition {
  const { saved, size } = input;
  if (saved !== null) {
    const centerX = saved.x + size / 2;
    const centerY = saved.y + size / 2;
    let nearest: { area: SidekickRect; distance: number } | null = null;
    for (const area of input.workAreas) {
      const distance = distanceToWorkArea(centerX, centerY, area);
      if (nearest === null || distance < nearest.distance) nearest = { area, distance };
    }
    if (nearest !== null && nearest.distance <= size) {
      return clampIntoWorkArea(saved, size, nearest.area);
    }
  }
  return defaultSidekickPosition(input.primaryWorkArea, size);
}

/** Resizes around the current center so a size change doesn't jump the sprite. */
export function resizeSidekickPosition(
  position: DesktopSidekickPosition,
  fromSize: number,
  toSize: number,
): DesktopSidekickPosition {
  const offset = Math.round((fromSize - toSize) / 2);
  return { x: position.x + offset, y: position.y + offset };
}

/** Space between the sprite and the hover list, in DIPs. The page draws the pointer inside it. */
export const SIDEKICK_PANEL_GAP_PX = 10;

/** Which side of the sprite the hover list opens on, and which edge they share. */
export interface SidekickPanelLayout {
  readonly placement: "above" | "below";
  readonly align: "start" | "end";
}

/**
 * Window bounds that fit the sprite plus its hover list without moving the
 * sprite on screen. The list opens toward the middle of the work area: above
 * unless it would not fit, and extending left from sprites on the right half.
 */
export function expandSidekickBounds(input: {
  readonly sprite: DesktopSidekickPosition;
  readonly size: number;
  readonly panel: { readonly width: number; readonly height: number };
  readonly workArea: SidekickRect;
}): { readonly bounds: SidekickRect; readonly layout: SidekickPanelLayout } {
  const { sprite, size, panel, workArea } = input;
  const extent = SIDEKICK_PANEL_GAP_PX + panel.height;
  const placement = sprite.y - workArea.y >= extent ? "above" : "below";
  const align = sprite.x + size / 2 > workArea.x + workArea.width / 2 ? "end" : "start";
  const width = Math.max(size, Math.ceil(panel.width));
  const height = size + Math.ceil(extent);
  return {
    bounds: {
      x: align === "end" ? sprite.x + size - width : sprite.x,
      y: placement === "above" ? sprite.y + size - height : sprite.y,
      width,
      height,
    },
    layout: { placement, align },
  };
}
