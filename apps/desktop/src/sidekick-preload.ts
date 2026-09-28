// @effect-diagnostics globalTimers:off -- Hover intent timers in a sandboxed page preload, outside any Effect fiber.
import type { DesktopSidekickSession, DesktopSidekickStatus } from "@t3tools/contracts";
import { ipcRenderer } from "electron";

import {
  SIDEKICK_WINDOW_INPUT_CHANNEL,
  SIDEKICK_WINDOW_LAYOUT_CHANNEL,
  SIDEKICK_WINDOW_STATUS_CHANNEL,
} from "./ipc/channels.ts";
import type { SidekickWindowInput, SidekickWindowLayout } from "./sidekick/SidekickWindowInput.ts";

// Drives the static sidekick page directly; nothing is exposed to page script.
const DRAG_THRESHOLD_PX = 3;
// Passing the pointer over the sprite on the way elsewhere should not open the list.
const HOVER_DELAY_MS = 150;
// Lets the pointer cross the gap between the sprite and the list.
const LEAVE_GRACE_MS = 200;

const STATUS_LABELS: Record<DesktopSidekickSession["state"], string> = {
  approval: "Approval",
  input: "Needs input",
  error: "Failed",
  plan: "Plan ready",
  working: "Working",
  success: "Completed",
};

let latestStatus: DesktopSidekickStatus | null = null;
let hovering = false;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;

const send = (input: SidekickWindowInput) => ipcRenderer.send(SIDEKICK_WINDOW_INPUT_CHANNEL, input);

/** Asks the main process to fit the rendered list, or to collapse when there is none. */
function requestExpand() {
  const panel = document.getElementById("panel");
  if (panel === null || !latestStatus || latestStatus.sessions.length === 0) {
    send({ type: "collapse" });
    return;
  }
  const { width, height } = panel.getBoundingClientRect();
  send({ type: "expand", width, height });
}

function stopHovering() {
  clearTimeout(hoverTimer);
  clearTimeout(leaveTimer);
  hovering = false;
}

function sessionBox(session: DesktopSidekickSession) {
  const box = document.createElement("button");
  box.className = "session";
  box.dataset.state = session.state;
  box.title = session.title;
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = session.title;
  const status = document.createElement("span");
  status.className = "status";
  status.textContent = STATUS_LABELS[session.state];
  box.append(title, status);
  box.addEventListener("click", () => {
    stopHovering();
    send({
      type: "open-thread",
      environmentId: session.environmentId,
      threadId: session.threadId,
    });
  });
  return box;
}

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
  const sprite = document.getElementById("sprite");
  // The list says it all; the tooltip is for when there is nothing to list.
  if (sprite) sprite.title = status.sessions.length > 0 ? "" : status.tooltip;
  const panel = document.getElementById("panel");
  if (panel) {
    const boxes: HTMLElement[] = status.sessions.map(sessionBox);
    if (status.moreCount > 0) {
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = `+${status.moreCount} more`;
      boxes.push(more);
    }
    panel.replaceChildren(...boxes);
  }
  if (hovering) requestExpand();
}

function applyLayout(layout: SidekickWindowLayout) {
  const body = document.body;
  body.classList.toggle("expanded", layout.expanded);
  if (!layout.expanded) return;
  body.style.setProperty("--size", `${layout.size}px`);
  body.style.setProperty("--gap", `${layout.gap}px`);
  body.classList.toggle("above", layout.placement === "above");
  body.classList.toggle("below", layout.placement === "below");
  body.classList.toggle("start", layout.align === "start");
  body.classList.toggle("end", layout.align === "end");
}

ipcRenderer.on(SIDEKICK_WINDOW_STATUS_CHANNEL, (_event, status: DesktopSidekickStatus) => {
  latestStatus = status;
  render();
});

ipcRenderer.on(SIDEKICK_WINDOW_LAYOUT_CHANNEL, (_event, layout: SidekickWindowLayout) => {
  applyLayout(layout);
});

window.addEventListener("DOMContentLoaded", () => {
  render();
  const sprite = document.getElementById("sprite");
  const panel = document.getElementById("panel");
  if (sprite === null || panel === null) return;
  let drag: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;

  const scheduleLeave = () => {
    clearTimeout(hoverTimer);
    if (!hovering) return;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      hovering = false;
      send({ type: "collapse" });
    }, LEAVE_GRACE_MS);
  };
  sprite.addEventListener("pointerenter", () => {
    clearTimeout(leaveTimer);
    if (hovering || drag !== null) return;
    hoverTimer = setTimeout(() => {
      hovering = true;
      requestExpand();
    }, HOVER_DELAY_MS);
  });
  sprite.addEventListener("pointerleave", scheduleLeave);
  panel.addEventListener("pointerenter", () => clearTimeout(leaveTimer));
  panel.addEventListener("pointerleave", scheduleLeave);

  sprite.addEventListener("pointerdown", (event) => {
    // Ctrl+click is the macOS secondary click; contextmenu handles it.
    if (event.button !== 0 || event.ctrlKey) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      moved: false,
    };
    sprite.setPointerCapture(event.pointerId);
  });
  sprite.addEventListener("pointermove", (event) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dx = event.screenX - drag.startX;
    const dy = event.screenY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      stopHovering();
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
  sprite.addEventListener("pointerup", (event) => endDrag(event, false));
  sprite.addEventListener("pointercancel", (event) => endDrag(event, true));
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    send({ type: "context-menu" });
  });
});
