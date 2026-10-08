import {
  EnvironmentId,
  type OrchestrationV2PendingRuntimeRequestSummary,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import { DateTime } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  pickSidekickTarget,
  resolveSidekickSnapshot,
  resolveSidekickThreadState,
  SIDEKICK_SLEEP_AFTER_MS,
  type SidekickEnvironmentInput,
  type SidekickThreadInput,
} from "./sidekick.logic";

const LOCAL = EnvironmentId.make("local");
const REMOTE = EnvironmentId.make("remote");
const NOW = Date.parse("2026-09-28T12:00:00.000Z");

function iso(offsetMs: number) {
  return new Date(NOW + offsetMs).toISOString();
}

function dt(offsetMs: number): DateTime.Utc {
  return DateTime.makeUnsafe(iso(offsetMs));
}

function thread(id: string, overrides: Partial<SidekickThreadInput> = {}): SidekickThreadInput {
  return {
    id: ThreadId.make(id),
    title: `Thread ${id}`,
    archivedAt: null,
    createdAt: dt(-60_000),
    updatedAt: dt(-60_000),
    status: "idle",
    activityRunStatus: null,
    latestRunCompletedAt: null,
    pendingRuntimeRequest: null,
    hasActionableProposedPlan: false,
    interactionMode: "default",
    ...overrides,
  };
}

function running(id: string, overrides: Partial<SidekickThreadInput> = {}) {
  return thread(id, {
    activityRunStatus: "running",
    updatedAt: dt(-1_000),
    ...overrides,
  });
}

function pendingApproval(id: string): OrchestrationV2PendingRuntimeRequestSummary {
  return {
    id: RuntimeRequestId.make(`${id}-approval`),
    kind: "command",
    createdAt: dt(-10_000),
  };
}

function pendingUserInput(id: string): OrchestrationV2PendingRuntimeRequestSummary {
  return {
    id: RuntimeRequestId.make(`${id}-input`),
    kind: "user_input",
    createdAt: dt(-10_000),
  };
}

const neverVisited = () => undefined;

function env(
  threads: readonly SidekickThreadInput[] | null,
  environmentId = LOCAL,
  connected = true,
): SidekickEnvironmentInput {
  return { environmentId, connected, threads };
}

describe("resolveSidekickThreadState", () => {
  it("reports an unseen completion as success and a seen one as waiting", () => {
    const completed = { latestRunCompletedAt: dt(-10_000) };
    expect(resolveSidekickThreadState(thread("a", completed), iso(-20_000))).toBe("success");
    expect(resolveSidekickThreadState(thread("a", completed), iso(-5_000))).toBe("waiting");
  });

  it("only reports failures the user has not seen", () => {
    const failed = { status: "failed" as const, latestRunCompletedAt: dt(-10_000) };
    expect(resolveSidekickThreadState(thread("a", failed), iso(-20_000))).toBe("error");
    expect(resolveSidekickThreadState(thread("a", failed), iso(-5_000))).toBe("waiting");
  });

  it("reports a settled actionable plan", () => {
    expect(
      resolveSidekickThreadState(
        thread("a", {
          interactionMode: "plan",
          hasActionableProposedPlan: true,
          latestRunCompletedAt: dt(-10_000),
        }),
        undefined,
      ),
    ).toBe("plan");
  });

  it("ignores archived threads", () => {
    expect(
      resolveSidekickThreadState(
        thread("a", { archivedAt: dt(0), pendingRuntimeRequest: pendingApproval("a") }),
        undefined,
      ),
    ).toBeNull();
  });
});

describe("resolveSidekickSnapshot", () => {
  it("rolls up to the most urgent state across environments", () => {
    const snapshot = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [
        env([running("a"), running("b")]),
        env([thread("c", { pendingRuntimeRequest: pendingApproval("c") })], REMOTE),
      ],
    });
    expect(snapshot.state).toBe("approval");
    expect(snapshot.badgeCount).toBe(1);
    expect(snapshot.targets).toEqual([{ environmentId: REMOTE, threadId: "c" }]);
    expect(snapshot.tooltip).toBe("Approval needed: Thread c\n1 approval · 2 working");
  });

  it("looks up visits per environment", () => {
    const completed = thread("a", { latestRunCompletedAt: dt(-10_000) });
    const snapshot = resolveSidekickSnapshot({
      lastVisitedAt: (environmentId) => (environmentId === REMOTE ? iso(-20_000) : iso(-5_000)),
      nowMs: NOW,
      environments: [env([completed]), env([completed], REMOTE)],
    });
    expect(snapshot.state).toBe("success");
    expect(snapshot.targets).toEqual([{ environmentId: REMOTE, threadId: "a" }]);
  });

  it("orders targets longest-waiting first", () => {
    const snapshot = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [
        env([
          thread("newer", {
            pendingRuntimeRequest: pendingUserInput("newer"),
            updatedAt: dt(-1_000),
          }),
          thread("older", {
            pendingRuntimeRequest: pendingUserInput("older"),
            updatedAt: dt(-50_000),
          }),
        ]),
      ],
    });
    expect(snapshot.state).toBe("input");
    expect(snapshot.badgeCount).toBe(2);
    expect(snapshot.targets.map((target) => target.threadId)).toEqual(["older", "newer"]);
  });

  it("does not badge non-attention states", () => {
    const snapshot = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [env([running("a"), running("b")])],
    });
    expect(snapshot).toMatchObject({ state: "working", badgeCount: 0 });
    expect(snapshot.targets).toHaveLength(2);
  });

  it("falls asleep after a long idle and reports when it will", () => {
    const idle = [thread("a", { updatedAt: dt(-60_000) })];
    const awake = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [env(idle)],
    });
    expect(awake).toMatchObject({
      state: "waiting",
      targets: [],
      nextChangeAtMs: NOW - 60_000 + SIDEKICK_SLEEP_AFTER_MS,
    });
    const asleep = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW + SIDEKICK_SLEEP_AFTER_MS,
      environments: [env(idle)],
    });
    expect(asleep).toMatchObject({ state: "sleeping", nextChangeAtMs: null });
  });

  it("lists non-idle threads ordered by first messaged (oldest first, so sessions[0] is bottom-most in panel), capped with a remainder", () => {
    const snapshot = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [
        env([
          running("w1", { createdAt: dt(-50_000) }),
          thread("idle", { createdAt: dt(-60_000) }),
          running("w3", { createdAt: dt(-30_000) }),
          running("w2", { createdAt: dt(-40_000) }),
          thread("done", { createdAt: dt(-20_000), latestRunCompletedAt: dt(-10_000) }),
        ]),
        env(
          [
            thread("ask", {
              createdAt: dt(-15_000),
              pendingRuntimeRequest: pendingUserInput("ask"),
            }),
            thread("approve", {
              createdAt: dt(-10_000),
              pendingRuntimeRequest: pendingApproval("approve"),
            }),
          ],
          REMOTE,
        ),
      ],
    });
    // First messaged (w1 at -50s) is sessions[0] (which renders at the bottom in column-reverse).
    expect(snapshot.sessions).toEqual([
      { environmentId: LOCAL, threadId: "w1", title: "Thread w1", state: "working" },
      { environmentId: LOCAL, threadId: "w2", title: "Thread w2", state: "working" },
      { environmentId: LOCAL, threadId: "w3", title: "Thread w3", state: "working" },
      { environmentId: REMOTE, threadId: "ask", title: "Thread ask", state: "input" },
    ]);
    expect(snapshot.moreCount).toBe(1);
  });

  it("does not change shown threads order when an agent performs actions and updates updatedAt while working", () => {
    const thread1 = running("t1", { createdAt: dt(-20_000), updatedAt: dt(-20_000) });
    const thread2 = running("t2", { createdAt: dt(-10_000), updatedAt: dt(-10_000) });

    const before = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [env([thread1, thread2])],
    });
    expect(before.sessions.map((s) => s.threadId)).toEqual(["t1", "t2"]);

    // Agent in thread 1 runs a command or streams tokens, bumping updatedAt to NOW.
    const thread1Working = running("t1", { createdAt: dt(-20_000), updatedAt: dt(0) });
    const after = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [env([thread1Working, thread2])],
    });
    // Order remains strictly identical: t1 (first messaged) stays sessions[0] (bottom-most).
    expect(after.sessions.map((s) => s.threadId)).toEqual(["t1", "t2"]);
  });

  it("lists nothing when every thread is idle", () => {
    const snapshot = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [env([thread("a"), thread("b")])],
    });
    expect(snapshot).toMatchObject({ sessions: [], moreCount: 0 });
  });

  it("truncates long titles for the hover list", () => {
    const [session] = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [env([running("a", { title: "x".repeat(500) })])],
    }).sessions;
    expect(session?.title).toHaveLength(120);
    expect(session?.title.endsWith("…")).toBe(true);
  });

  it("is offline only when no environment is connected", () => {
    expect(
      resolveSidekickSnapshot({
        lastVisitedAt: neverVisited,
        nowMs: NOW,
        environments: [env(null, LOCAL, false)],
      }).state,
    ).toBe("offline");
    const partial = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [env([running("a")]), env([running("b")], REMOTE, false)],
    });
    expect(partial.state).toBe("working");
    expect(partial.targets).toEqual([{ environmentId: LOCAL, threadId: "a" }]);
    expect(partial.tooltip).toBe("Working: Thread a\n1 working · 1 environment offline");
  });
});

describe("pickSidekickTarget", () => {
  const a = { environmentId: LOCAL, threadId: ThreadId.make("a") };
  const b = { environmentId: REMOTE, threadId: ThreadId.make("b") };

  it("starts at the first target and cycles after the last opened", () => {
    expect(pickSidekickTarget([a, b], null)).toBe(a);
    expect(pickSidekickTarget([a, b], a)).toBe(b);
    expect(pickSidekickTarget([a, b], b)).toBe(a);
  });

  it("returns the first target when the previous target is no longer active", () => {
    const c = { environmentId: LOCAL, threadId: ThreadId.make("c") };
    expect(pickSidekickTarget([a, b], c)).toBe(a);
  });
});
