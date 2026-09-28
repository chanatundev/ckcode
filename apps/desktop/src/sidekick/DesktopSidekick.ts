import type {
  DesktopSidekickPreferences,
  DesktopSidekickPreferencesPatch,
  DesktopSidekickStatus,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import { SIDEKICK_PREFERENCES_CHANGED_CHANNEL } from "../ipc/channels.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";

export const INITIAL_SIDEKICK_STATUS: DesktopSidekickStatus = {
  state: "waiting",
  badgeCount: 0,
  tooltip: "",
};

export const toSidekickPreferences = (
  settings: DesktopAppSettings.DesktopSettings,
): DesktopSidekickPreferences => ({
  enabled: settings.sidekickEnabled,
  size: settings.sidekickSize,
});

/**
 * Owns the sidekick's persisted preferences and the latest status the main
 * renderer rolled up. Preference changes are broadcast so every entry point
 * (settings, slash command, menus) stays in sync.
 */
export class DesktopSidekick extends Context.Service<
  DesktopSidekick,
  {
    readonly status: Effect.Effect<DesktopSidekickStatus>;
    readonly setStatus: (status: DesktopSidekickStatus) => Effect.Effect<void>;
    readonly preferences: Effect.Effect<DesktopSidekickPreferences>;
    readonly setPreferences: (
      patch: DesktopSidekickPreferencesPatch,
    ) => Effect.Effect<DesktopSidekickPreferences, DesktopAppSettings.DesktopSettingsWriteError>;
  }
>()("@t3tools/desktop/sidekick/DesktopSidekick") {}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const appSettings = yield* DesktopAppSettings.DesktopAppSettings;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const statusRef = yield* Ref.make(INITIAL_SIDEKICK_STATUS);

  const preferences = appSettings.get.pipe(Effect.map(toSidekickPreferences));

  return DesktopSidekick.of({
    status: Ref.get(statusRef),
    setStatus: (status) => Ref.set(statusRef, status),
    preferences,
    setPreferences: Effect.fn("desktop.sidekick.setPreferences")(function* (patch) {
      const change = yield* appSettings.setSidekickPreferences(patch);
      const next = toSidekickPreferences(change.settings);
      if (change.changed) {
        yield* electronWindow.sendAll(SIDEKICK_PREFERENCES_CHANGED_CHANNEL, next);
      }
      return next;
    }),
  });
});

export const layer = Layer.effect(DesktopSidekick, make);
