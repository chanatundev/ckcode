import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId, ThreadId } from "./baseSchemas.ts";
import {
  DESKTOP_SIDEKICK_ACTIVATE_MENU_ACTION,
  DesktopEnvironmentBootstrapSchema,
  desktopSidekickOpenThreadMenuAction,
  parseDesktopSidekickOpenThreadMenuAction,
} from "./ipc.ts";

describe("DesktopEnvironmentBootstrapSchema", () => {
  const decode = Schema.decodeUnknownSync(DesktopEnvironmentBootstrapSchema);

  it("preserves the concrete running distro separately from the backend id", () => {
    expect(
      decode({
        id: "wsl:default",
        label: "WSL (Ubuntu)",
        runningDistro: "Ubuntu",
        httpBaseUrl: "http://127.0.0.1:3774/",
        wsBaseUrl: "ws://127.0.0.1:3774/",
      }),
    ).toEqual({
      id: "wsl:default",
      label: "WSL (Ubuntu)",
      runningDistro: "Ubuntu",
      httpBaseUrl: "http://127.0.0.1:3774/",
      wsBaseUrl: "ws://127.0.0.1:3774/",
    });
  });

  it("allows non-running and non-WSL bootstraps to report no running distro", () => {
    expect(
      decode({
        id: "primary",
        label: "Windows",
        runningDistro: null,
        httpBaseUrl: null,
        wsBaseUrl: null,
      }).runningDistro,
    ).toBeNull();
  });
});

describe("sidekick open-thread menu action", () => {
  it("round-trips the thread it targets", () => {
    const thread = {
      environmentId: EnvironmentId.make("env:with/odd:chars"),
      threadId: ThreadId.make("thread-1"),
    };
    expect(
      parseDesktopSidekickOpenThreadMenuAction(desktopSidekickOpenThreadMenuAction(thread)),
    ).toEqual(thread);
  });

  it("ignores other and malformed actions", () => {
    expect(parseDesktopSidekickOpenThreadMenuAction(DESKTOP_SIDEKICK_ACTIVATE_MENU_ACTION)).toBe(
      null,
    );
    expect(parseDesktopSidekickOpenThreadMenuAction("sidekick-open-thread:{")).toBe(null);
    expect(
      parseDesktopSidekickOpenThreadMenuAction('sidekick-open-thread:{"environmentId":"e"}'),
    ).toBe(null);
  });
});
