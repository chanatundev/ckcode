import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import {
  AVAILABLE_CONNECTION_STATE,
  connectionProjectionPhase,
} from "@t3tools/client-runtime/connection";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import {
  DESKTOP_SIDEKICK_ACTIVATE_MENU_ACTION,
  type DesktopSidekickStatus,
  parseDesktopSidekickOpenThreadMenuAction,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useEffect, useRef, useState } from "react";

import { environmentCatalog } from "../connection/catalog";
import { useDesktopSidekickPreferences } from "../lib/desktopSidekick";
import {
  pickSidekickTarget,
  resolveSidekickSnapshot,
  type SidekickEnvironmentInput,
} from "../sidekick.logic";
import { environmentShell } from "../state/shell";
import { useUiStateStore } from "../uiStateStore";

const sidekickEnvironmentsAtom = Atom.make((get): SidekickEnvironmentInput[] =>
  Array.from(enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom)), (environmentId) => {
    const shell = get(environmentShell.stateValueAtom(environmentId));
    // A cached snapshot can hold stale running threads; only live ones count.
    const threads =
      shell.status === "live" && Option.isSome(shell.snapshot)
        ? shell.snapshot.value.threads
        : null;
    const connection = Option.getOrElse(
      AsyncResult.value(get(environmentCatalog.stateAtom(environmentId))),
      () => AVAILABLE_CONNECTION_STATE,
    );
    return {
      environmentId,
      connected: threads !== null || connectionProjectionPhase(connection) !== "disconnected",
      threads,
    };
  }),
).pipe(Atom.withLabel("web-sidekick-environments"));

/** Mirrors the desktop sidekick preference; web builds never render anything. */
export function SidekickCoordinator() {
  const preferences = useDesktopSidekickPreferences();
  return preferences?.enabled ? <SidekickStatusPublisher /> : null;
}

function SidekickStatusPublisher() {
  const environments = useAtomValue(sidekickEnvironmentsAtom);
  const lastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const navigate = useNavigate();
  // Only advanced by the sleep timer. A stale clock can only delay sleeping,
  // never cause it, and the timer catches it up.
  const [nowMs, setNowMs] = useState(Date.now);
  const targets = useRef<readonly ScopedThreadRef[]>([]);
  const lastOpened = useRef<ScopedThreadRef | null>(null);
  const lastSentKey = useRef<string | null>(null);

  useEffect(() => {
    const snapshot = resolveSidekickSnapshot({
      nowMs,
      environments,
      lastVisitedAt: (environmentId, threadId) =>
        lastVisitedAtById[scopedThreadKey(scopeThreadRef(environmentId, threadId))],
    });
    targets.current = snapshot.targets;
    const status = {
      state: snapshot.state,
      badgeCount: snapshot.badgeCount,
      tooltip: snapshot.tooltip,
      sessions: snapshot.sessions,
      moreCount: snapshot.moreCount,
    } satisfies DesktopSidekickStatus;
    // Thread updates stream in while agents work; only real changes cross IPC.
    const key = JSON.stringify(status);
    if (key !== lastSentKey.current) {
      lastSentKey.current = key;
      window.desktopBridge?.setSidekickStatus?.(status).catch(() => undefined);
    }
    // Falling asleep is the one change no thread event announces.
    if (snapshot.nextChangeAtMs === null) return;
    const timer = window.setTimeout(
      () => setNowMs(Date.now()),
      Math.max(0, snapshot.nextChangeAtMs - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [environments, lastVisitedAtById, nowMs]);

  useEffect(
    () =>
      window.desktopBridge?.onMenuAction((action) => {
        const target =
          action === DESKTOP_SIDEKICK_ACTIVATE_MENU_ACTION
            ? pickSidekickTarget(targets.current, lastOpened.current)
            : parseDesktopSidekickOpenThreadMenuAction(action);
        if (target === null) return;
        lastOpened.current = target;
        void navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId: target.environmentId, threadId: target.threadId },
        });
      }),
    [navigate],
  );

  return null;
}
