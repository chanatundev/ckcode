import {
  DESKTOP_SIDEKICK_MAX_SESSIONS,
  type DesktopSidekickSession,
  type DesktopSidekickState,
  type EnvironmentId,
  type OrchestrationV2ThreadShell,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { DateTime } from "effect";

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
  OrchestrationV2ThreadShell,
  | "id"
  | "title"
  | "archivedAt"
  | "createdAt"
  | "updatedAt"
  | "status"
  | "activityRunStatus"
  | "latestRunCompletedAt"
  | "pendingRuntimeRequest"
  | "hasActionableProposedPlan"
  | "interactionMode"
>;

/** When this client last opened a thread; undefined if it never has. */
export type SidekickLastVisitedAt = (
  environmentId: EnvironmentId,
  threadId: OrchestrationV2ThreadShell["id"],
) => string | undefined;

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
  /** Every non-idle thread, first-messaged first (sessions[0] is bottom-most in panel), capped for the hover list. */
  readonly sessions: readonly DesktopSidekickSession[];
  /** Non-idle threads beyond `sessions`. */
  readonly moreCount: number;
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

function parseMs(value: DateTime.Utc | string | number | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (DateTime.isDateTime(value)) {
    return DateTime.toEpochMillis(value);
  }
  return null;
}

/**
 * Same rule as the sidebar's unseen completion: threads never opened on this
 * client stay quiet, and an unreadable visit time counts as unseen.
 */
function isUnseen(atMs: number | null, lastVisitedAt: string | undefined): boolean {
  if (atMs === null || lastVisitedAt === undefined) return false;
  const visitedAt = parseMs(lastVisitedAt);
  return visitedAt === null || atMs > visitedAt;
}

/** Per-thread sidekick state, or null when the thread should not count. */
export function resolveSidekickThreadState(
  thread: SidekickThreadInput,
  lastVisitedAt: string | undefined,
): ThreadState | null {
  if (thread.archivedAt !== null) return null;
  if (
    thread.pendingRuntimeRequest !== null &&
    thread.pendingRuntimeRequest !== undefined &&
    thread.pendingRuntimeRequest.kind !== "user_input" &&
    thread.pendingRuntimeRequest.kind !== "auth_refresh"
  ) {
    return "approval";
  }
  if (thread.pendingRuntimeRequest?.kind === "user_input") return "input";
  if (
    thread.activityRunStatus === "running" ||
    thread.activityRunStatus === "starting" ||
    thread.activityRunStatus === "preparing"
  ) {
    return "working";
  }
  const failed = thread.status === "failed";
  const failedAt = parseMs(thread.latestRunCompletedAt) ?? parseMs(thread.updatedAt);
  if (failed && isUnseen(failedAt, lastVisitedAt)) return "error";
  if (
    thread.interactionMode === "plan" &&
    thread.hasActionableProposedPlan &&
    (thread.activityRunStatus === null || thread.activityRunStatus === "waiting")
  ) {
    return "plan";
  }
  if (thread.activityRunStatus === "waiting") return "working";
  if (isUnseen(parseMs(thread.latestRunCompletedAt), lastVisitedAt)) return "success";
  return "waiting";
}

/** When the thread entered its current state, for longest-waiting-first ordering. */
function waitingSinceMs(thread: SidekickThreadInput, state: ThreadState): number {
  const completedAt = parseMs(thread.latestRunCompletedAt);
  if ((state === "error" || state === "success" || state === "plan") && completedAt !== null) {
    return completedAt;
  }
  if (state === "working") {
    return parseMs(thread.createdAt) ?? 0;
  }
  return parseMs(thread.updatedAt) ?? 0;
}

function lastActivityMs(thread: SidekickThreadInput): number {
  return Math.max(parseMs(thread.latestRunCompletedAt) ?? 0, parseMs(thread.updatedAt) ?? 0);
}

const MAX_TITLE_LENGTH = 120;

function truncateTitle(title: string): string {
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title;
}

function pluralize(count: number, [singular, plural]: [string, string]) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function resolveSidekickSnapshot(input: {
  readonly environments: readonly SidekickEnvironmentInput[];
  readonly lastVisitedAt: SidekickLastVisitedAt;
  readonly nowMs: number;
}): SidekickSnapshot {
  const offlineCount = input.environments.filter((environment) => !environment.connected).length;
  if (offlineCount === input.environments.length) {
    return {
      state: "offline",
      badgeCount: 0,
      tooltip: STATE_HEADLINES.offline,
      targets: [],
      sessions: [],
      moreCount: 0,
      nextChangeAtMs: null,
    };
  }

  const byState = new Map<
    ThreadState,
    { ref: ScopedThreadRef; title: string; sinceMs: number }[]
  >();
  const activeEntries: Array<{
    ref: ScopedThreadRef;
    title: string;
    createdAtMs: number;
    state: Exclude<ThreadState, "waiting">;
  }> = [];
  let latestActivityMs = 0;
  for (const environment of input.environments) {
    if (!environment.connected || environment.threads === null) continue;
    for (const thread of environment.threads) {
      const state = resolveSidekickThreadState(
        thread,
        input.lastVisitedAt(environment.environmentId, thread.id),
      );
      if (state === null) continue;
      latestActivityMs = Math.max(latestActivityMs, lastActivityMs(thread));
      const entries = byState.get(state) ?? [];
      entries.push({
        ref: { environmentId: environment.environmentId, threadId: thread.id },
        title: thread.title,
        sinceMs: waitingSinceMs(thread, state),
      });
      byState.set(state, entries);

      if (state !== "waiting") {
        activeEntries.push({
          ref: { environmentId: environment.environmentId, threadId: thread.id },
          title: thread.title,
          createdAtMs: parseMs(thread.createdAt) ?? 0,
          state,
        });
      }
    }
  }

  const longestWaitingFirst = (
    left: { ref: ScopedThreadRef; sinceMs: number },
    right: { ref: ScopedThreadRef; sinceMs: number },
  ) => left.sinceMs - right.sinceMs || left.ref.threadId.localeCompare(right.ref.threadId);
  const topState = STATE_PRIORITY.find((state) => byState.has(state)) ?? "waiting";
  const top = (byState.get(topState) ?? []).toSorted(longestWaitingFirst);

  const active = activeEntries.toSorted(
    (left, right) =>
      left.createdAtMs - right.createdAtMs || left.ref.threadId.localeCompare(right.ref.threadId),
  );
  const sessions = active
    .slice(0, DESKTOP_SIDEKICK_MAX_SESSIONS)
    .map((entry): DesktopSidekickSession => ({
      environmentId: entry.ref.environmentId,
      threadId: entry.ref.threadId,
      title: truncateTitle(entry.title),
      state: entry.state,
    }));

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
    sessions,
    moreCount: active.length - sessions.length,
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
