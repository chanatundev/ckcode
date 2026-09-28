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

/**
 * Keeps a saved position on whichever display holds the sidekick's center,
 * pulled fully inside that work area. A position whose display is gone falls
 * back to the default corner of the primary display.
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
    const workArea = input.workAreas.find(
      (area) =>
        centerX >= area.x &&
        centerX < area.x + area.width &&
        centerY >= area.y &&
        centerY < area.y + area.height,
    );
    if (workArea) return clampIntoWorkArea(saved, size, workArea);
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
