import type {
  DesktopSidekickState,
  EnvironmentId,
  OrchestrationThreadShell,
  ScopedThreadRef,
} from "@t3tools/contracts";

import { hasUnseenCompletion, resolveSidebarThreadStatus } from "./components/Sidebar.logic";
import { isLatestTurnSettled } from "./session-logic";

export type SidekickState = DesktopSidekickState;

/** Idle this long with nothing running and the sidekick falls asleep. */
export const SIDEKICK_SLEEP_AFTER_MS = 30 * 60 * 1000;

// Highest first. Attention states outrank work so a pending approval is never
// hidden behind a sibling thread that is still running.
const STATE_PRIORITY = [
  "approval",
  "input",
  "error",
  "plan",
  "working",
  "success",
  "waiting",
] as const satisfies readonly SidekickState[];

type ThreadState = (typeof STATE_PRIORITY)[number];

/** States that ask the user to act; only these carry a count badge. */
const ATTENTION_STATES: ReadonlySet<SidekickState> = new Set([
  "approval",
  "input",
  "error",
  "plan",
]);

export type SidekickThreadInput = Pick<
  OrchestrationThreadShell,
  | "id"
  | "title"
  | "archivedAt"
  | "updatedAt"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "hasActionableProposedPlan"
  | "interactionMode"
  | "latestTurn"
  | "session"
  | "backgroundLiveness"
> & { readonly lastVisitedAt?: string | undefined };

export interface SidekickEnvironmentInput {
  readonly environmentId: EnvironmentId;
  readonly connected: boolean;
  /** Null until the environment has a live snapshot; stale caches must not drive state. */
  readonly threads: readonly SidekickThreadInput[] | null;
}

export interface SidekickSnapshot {
  readonly state: SidekickState;
  /** Threads in `state`, shown as a badge for attention states only. */
  readonly badgeCount: number;
  readonly tooltip: string;
  /** Threads in `state`, longest-waiting first. Clicks cycle through these. */
  readonly targets: readonly ScopedThreadRef[];
  /** When the snapshot changes without new thread data (falling asleep). */
  readonly nextChangeAtMs: number | null;
}

const STATE_HEADLINES: Record<SidekickState, string> = {
  approval: "Approval needed",
  input: "Input needed",
  error: "Thread failed",
  plan: "Plan ready",
  working: "Working",
  success: "Thread completed",
  waiting: "All caught up",
  sleeping: "All caught up",
  offline: "No environment connected",
};

const BREAKDOWN_LABELS: Record<Exclude<ThreadState, "waiting">, [string, string]> = {
  approval: ["approval", "approvals"],
  input: ["question", "questions"],
  error: ["failed", "failed"],
  plan: ["plan ready", "plans ready"],
  working: ["working", "working"],
  success: ["completed", "completed"],
};

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function hasUnseenFailure(thread: SidekickThreadInput): boolean {
  const failedAt = parseMs(thread.latestTurn?.completedAt) ?? parseMs(thread.session?.updatedAt);
  const visitedAt = parseMs(thread.lastVisitedAt);
  // Mirrors hasUnseenCompletion: threads never opened on this client stay quiet.
  if (failedAt === null || thread.lastVisitedAt === undefined) return false;
  return visitedAt === null || failedAt > visitedAt;
}

/** Per-thread sidekick state, or null when the thread should not count. */
export function resolveSidekickThreadState(thread: SidekickThreadInput): ThreadState | null {
  if (thread.archivedAt !== null) return null;
  const status = resolveSidebarThreadStatus(thread);
  if (status === "approval" || status === "input") return status;
  if (thread.session?.status === "running" || thread.session?.status === "starting") {
    return "working";
  }
  const failed =
    status === "failed" || (status === "ready" && thread.latestTurn?.state === "error");
  if (failed && hasUnseenFailure(thread)) return "error";
  if (
    thread.interactionMode === "plan" &&
    thread.hasActionableProposedPlan &&
    isLatestTurnSettled(thread.latestTurn, thread.session)
  ) {
    return "plan";
  }
  if (status === "working") return "working";
  if (hasUnseenCompletion(thread)) return "success";
  return "waiting";
}

/** When the thread entered its current state, for longest-waiting-first ordering. */
function waitingSinceMs(thread: SidekickThreadInput, state: ThreadState): number {
  const completedAt = parseMs(thread.latestTurn?.completedAt);
  if ((state === "error" || state === "success" || state === "plan") && completedAt !== null) {
    return completedAt;
  }
  return parseMs(thread.updatedAt) ?? 0;
}

function lastActivityMs(thread: SidekickThreadInput): number {
  return Math.max(
    parseMs(thread.latestTurn?.completedAt) ?? 0,
    parseMs(thread.session?.updatedAt) ?? 0,
    parseMs(thread.updatedAt) ?? 0,
  );
}

function pluralize(count: number, [singular, plural]: [string, string]) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function resolveSidekickSnapshot(input: {
  readonly environments: readonly SidekickEnvironmentInput[];
  readonly nowMs: number;
}): SidekickSnapshot {
  const offlineCount = input.environments.filter((environment) => !environment.connected).length;
  if (offlineCount === input.environments.length) {
    return {
      state: "offline",
      badgeCount: 0,
      tooltip: STATE_HEADLINES.offline,
      targets: [],
      nextChangeAtMs: null,
    };
  }

  const byState = new Map<
    ThreadState,
    { ref: ScopedThreadRef; title: string; sinceMs: number }[]
  >();
  let latestActivityMs = 0;
  for (const environment of input.environments) {
    if (!environment.connected || environment.threads === null) continue;
    for (const thread of environment.threads) {
      const state = resolveSidekickThreadState(thread);
      if (state === null) continue;
      latestActivityMs = Math.max(latestActivityMs, lastActivityMs(thread));
      const entries = byState.get(state) ?? [];
      entries.push({
        ref: { environmentId: environment.environmentId, threadId: thread.id },
        title: thread.title,
        sinceMs: waitingSinceMs(thread, state),
      });
      byState.set(state, entries);
    }
  }

  const topState = STATE_PRIORITY.find((state) => byState.has(state)) ?? "waiting";
  const top = (byState.get(topState) ?? []).toSorted(
    (left, right) =>
      left.sinceMs - right.sinceMs || left.ref.threadId.localeCompare(right.ref.threadId),
  );

  const breakdown = STATE_PRIORITY.flatMap((state) => {
    if (state === "waiting") return [];
    const count = byState.get(state)?.length ?? 0;
    return count > 0 ? [pluralize(count, BREAKDOWN_LABELS[state])] : [];
  });
  if (offlineCount > 0) {
    breakdown.push(`${offlineCount} environment${offlineCount === 1 ? "" : "s"} offline`);
  }

  let state: SidekickState = topState;
  let nextChangeAtMs: number | null = null;
  if (topState === "waiting") {
    const sleepsAtMs = latestActivityMs + SIDEKICK_SLEEP_AFTER_MS;
    if (input.nowMs >= sleepsAtMs) state = "sleeping";
    else nextChangeAtMs = sleepsAtMs;
  }

  const firstTitle = topState === "waiting" ? undefined : top[0]?.title;
  const headline = firstTitle ? `${STATE_HEADLINES[state]}: ${firstTitle}` : STATE_HEADLINES[state];
  return {
    state,
    badgeCount: ATTENTION_STATES.has(state) ? top.length : 0,
    tooltip: breakdown.length > 0 ? `${headline}\n${breakdown.join(" · ")}` : headline,
    targets: topState === "waiting" ? [] : top.map((entry) => entry.ref),
    nextChangeAtMs,
  };
}

/** The next thread a click should open: the one after the last opened, wrapping. */
export function pickSidekickTarget(
  targets: readonly ScopedThreadRef[],
  lastOpened: ScopedThreadRef | null,
): ScopedThreadRef | null {
  if (targets.length === 0) return null;
  if (lastOpened === null) return targets[0] ?? null;
  const index = targets.findIndex(
    (target) =>
      target.environmentId === lastOpened.environmentId && target.threadId === lastOpened.threadId,
  );
  return targets[(index + 1) % targets.length] ?? null;
}
