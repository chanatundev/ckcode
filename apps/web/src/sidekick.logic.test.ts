import { EnvironmentId, ThreadId, TurnId } from "@t3tools/contracts";
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

function thread(id: string, overrides: Partial<SidekickThreadInput> = {}): SidekickThreadInput {
  return {
    id: ThreadId.make(id),
    title: `Thread ${id}`,
    archivedAt: null,
    updatedAt: iso(-60_000),
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    interactionMode: "default",
    latestTurn: null,
    session: null,
    backgroundLiveness: null,
    ...overrides,
  };
}

function running(id: string, overrides: Partial<SidekickThreadInput> = {}) {
  return thread(id, {
    session: {
      threadId: ThreadId.make(id),
      status: "running",
      providerName: null,
      runtimeMode: "full-access",
      activeTurnId: TurnId.make(`${id}-turn`),
      lastError: null,
      updatedAt: iso(-1_000),
    },
    ...overrides,
  });
}

function settledTurn(
  id: string,
  completedAt: string,
  state: "completed" | "error" = "completed",
): SidekickThreadInput["latestTurn"] {
  return {
    turnId: TurnId.make(`${id}-turn`),
    state,
    requestedAt: iso(-120_000),
    startedAt: iso(-110_000),
    completedAt,
    assistantMessageId: null,
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
    const completed = { latestTurn: settledTurn("a", iso(-10_000)) };
    expect(resolveSidekickThreadState(thread("a", completed), iso(-20_000))).toBe("success");
    expect(resolveSidekickThreadState(thread("a", completed), iso(-5_000))).toBe("waiting");
  });

  it("only reports failures the user has not seen", () => {
    const failed = { latestTurn: settledTurn("a", iso(-10_000), "error") };
    expect(resolveSidekickThreadState(thread("a", failed), iso(-20_000))).toBe("error");
    expect(resolveSidekickThreadState(thread("a", failed), iso(-5_000))).toBe("waiting");
  });

  it("reports a settled actionable plan", () => {
    expect(
      resolveSidekickThreadState(
        thread("a", {
          interactionMode: "plan",
          hasActionableProposedPlan: true,
          latestTurn: settledTurn("a", iso(-10_000)),
        }),
        undefined,
      ),
    ).toBe("plan");
  });

  it("ignores archived threads", () => {
    expect(
      resolveSidekickThreadState(
        thread("a", { archivedAt: iso(0), hasPendingApprovals: true }),
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
        env([thread("c", { hasPendingApprovals: true })], REMOTE),
      ],
    });
    expect(snapshot.state).toBe("approval");
    expect(snapshot.badgeCount).toBe(1);
    expect(snapshot.targets).toEqual([{ environmentId: REMOTE, threadId: "c" }]);
    expect(snapshot.tooltip).toBe("Approval needed: Thread c\n1 approval · 2 working");
  });

  it("looks up visits per environment", () => {
    const completed = thread("a", { latestTurn: settledTurn("a", iso(-10_000)) });
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
          thread("newer", { hasPendingUserInput: true, updatedAt: iso(-1_000) }),
          thread("older", { hasPendingUserInput: true, updatedAt: iso(-50_000) }),
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
    const idle = [thread("a", { updatedAt: iso(-60_000) })];
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

  it("lists every non-idle thread, most urgent first, capped with a remainder", () => {
    const snapshot = resolveSidekickSnapshot({
      lastVisitedAt: neverVisited,
      nowMs: NOW,
      environments: [
        env([
          running("w1"),
          thread("idle"),
          running("w3"),
          running("w2"),
          thread("done", { latestTurn: settledTurn("done", iso(-10_000)) }),
        ]),
        env(
          [
            thread("ask", { hasPendingUserInput: true }),
            thread("approve", { hasPendingApprovals: true }),
          ],
          REMOTE,
        ),
      ],
    });
    expect(snapshot.sessions).toEqual([
      { environmentId: REMOTE, threadId: "approve", title: "Thread approve", state: "approval" },
      { environmentId: REMOTE, threadId: "ask", title: "Thread ask", state: "input" },
      { environmentId: LOCAL, threadId: "w1", title: "Thread w1", state: "working" },
      { environmentId: LOCAL, threadId: "w2", title: "Thread w2", state: "working" },
    ]);
    expect(snapshot.moreCount).toBe(1);
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

  it("restarts when the last opened thread left the queue", () => {
    expect(pickSidekickTarget([b], a)).toBe(b);
    expect(pickSidekickTarget([], a)).toBeNull();
  });
});
