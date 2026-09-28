import {
  DesktopSidekickPreferencesPatchSchema,
  DesktopSidekickPreferencesSchema,
  DesktopSidekickStatusSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopSidekick from "../../sidekick/DesktopSidekick.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const setSidekickStatus = makeIpcMethod({
  channel: IpcChannels.SET_SIDEKICK_STATUS_CHANNEL,
  payload: DesktopSidekickStatusSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.sidekick.setStatus")(function* (status, event) {
    const sidekick = yield* DesktopSidekick.DesktopSidekick;
    yield* sidekick.setStatus(status, event?.sender.id);
  }),
});

export const getSidekickPreferences = makeIpcMethod({
  channel: IpcChannels.GET_SIDEKICK_PREFERENCES_CHANNEL,
  payload: Schema.Void,
  result: DesktopSidekickPreferencesSchema,
  handler: Effect.fn("desktop.ipc.sidekick.getPreferences")(function* () {
    const sidekick = yield* DesktopSidekick.DesktopSidekick;
    return yield* sidekick.preferences;
  }),
});

export const setSidekickPreferences = makeIpcMethod({
  channel: IpcChannels.SET_SIDEKICK_PREFERENCES_CHANNEL,
  payload: DesktopSidekickPreferencesPatchSchema,
  result: DesktopSidekickPreferencesSchema,
  handler: Effect.fn("desktop.ipc.sidekick.setPreferences")(function* (patch) {
    const sidekick = yield* DesktopSidekick.DesktopSidekick;
    return yield* sidekick.setPreferences(patch);
  }),
});
