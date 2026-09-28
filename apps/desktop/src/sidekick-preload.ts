import type { DesktopSidekickStatus } from "@t3tools/contracts";
import { ipcRenderer } from "electron";

import { SIDEKICK_WINDOW_INPUT_CHANNEL, SIDEKICK_WINDOW_STATUS_CHANNEL } from "./ipc/channels.ts";
import type { SidekickWindowInput } from "./sidekick/SidekickWindowInput.ts";

// Drives the static sidekick page directly; nothing is exposed to page script.
const DRAG_THRESHOLD_PX = 3;

let latestStatus: DesktopSidekickStatus | null = null;

const send = (input: SidekickWindowInput) => ipcRenderer.send(SIDEKICK_WINDOW_INPUT_CHANNEL, input);

function render() {
  const status = latestStatus;
  if (status === null || document.readyState === "loading") return;
  for (const sprite of document.querySelectorAll<HTMLImageElement>(".sprite")) {
    sprite.classList.toggle("active", sprite.dataset.state === status.state);
  }
  const badge = document.getElementById("badge");
  if (badge) {
    badge.textContent = status.badgeCount > 99 ? "99+" : String(status.badgeCount);
    badge.classList.toggle("visible", status.badgeCount > 0);
  }
  document.body.title = status.tooltip;
}

ipcRenderer.on(SIDEKICK_WINDOW_STATUS_CHANNEL, (_event, status: DesktopSidekickStatus) => {
  latestStatus = status;
  render();
});

window.addEventListener("DOMContentLoaded", () => {
  render();
  let drag: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      moved: false,
    };
    document.body.setPointerCapture(event.pointerId);
  });
  document.addEventListener("pointermove", (event) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dx = event.screenX - drag.startX;
    const dy = event.screenY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      document.body.classList.add("dragging");
      send({ type: "drag-start" });
    }
    send({ type: "drag-move", dx, dy });
  });
  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const { moved } = drag;
    drag = null;
    document.body.classList.remove("dragging");
    if (moved) send({ type: "drag-end" });
    else if (!cancelled) send({ type: "click" });
  };
  document.addEventListener("pointerup", (event) => endDrag(event, false));
  document.addEventListener("pointercancel", (event) => endDrag(event, true));
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    send({ type: "context-menu" });
  });
});
