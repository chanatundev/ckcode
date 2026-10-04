import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import {
  ComputerOperationError,
  ComputerScreenshotToolkit,
  ComputerStandardToolkit,
} from "./tools.ts";

const MAX_TREE_CHARS = 20_000;
const MAX_APP_RESULTS = 100;

const operation = <A>(name: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new ComputerOperationError({
        operation: name,
        reason:
          cause instanceof Error && cause.message.trim().length > 0
            ? cause.message.slice(0, 1_000)
            : "The desktop accessibility operation failed.",
      }),
  });

const withComputerAccess = <A>(name: string, run: () => Promise<A>) =>
  Effect.gen(function* () {
    yield* McpInvocationContext.requireMcpCapability("computer");
    return yield* operation(name, run);
  });

const handlers = {
  computer_list_apps: (input) =>
    withComputerAccess("computer_list_apps", async () => {
      const { App } = await import("@crowecawcaw/xa11y");
      const apps = await App.list();
      const limit = Math.min(input.limit ?? 50, MAX_APP_RESULTS);
      return {
        apps: apps.slice(0, limit).map((app) => ({
          name: app.name,
          pid: app.pid,
          foreground: app.isForeground,
        })),
        truncated: apps.length > limit,
      };
    }),
  computer_accessibility_tree: (input) =>
    withComputerAccess("computer_accessibility_tree", async () => {
      const { App } = await import("@crowecawcaw/xa11y");
      const app = input.app
        ? await App.byName(input.app, { timeout: 0 })
        : await App.foreground({ timeout: 0 });
      const rawTree = await app.dump(input.maxDepth ?? 6);
      return {
        app: app.name,
        pid: app.pid,
        tree: rawTree.slice(0, MAX_TREE_CHARS),
        truncated: rawTree.length > MAX_TREE_CHARS,
      };
    }),
  computer_activate_app: (input) =>
    withComputerAccess("computer_activate_app", async () => {
      const { App } = await import("@crowecawcaw/xa11y");
      const app = await App.byName(input.app, { timeout: 0 });
      const windows = await app.children();
      const window = input.window
        ? windows.find((candidate) => candidate.name === input.window)
        : (windows.find((candidate) => candidate.active) ?? windows[0]);
      if (!window) {
        throw new Error(
          input.window
            ? `No window titled '${input.window}' was found in ${app.name}.`
            : `No accessible window was found in ${app.name}.`,
        );
      }
      await window.focus();
      return { app: app.name, window: window.name ?? "" };
    }),
  computer_screenshot: (input) =>
    withComputerAccess("computer_screenshot", async () => {
      const imported = await import("@crowecawcaw/xa11y");
      const xa11y =
        (imported as unknown as { readonly default?: typeof imported }).default ?? imported;
      let appName: string | null = null;
      let region: { x: number; y: number; width: number; height: number } | undefined;
      try {
        const app = await xa11y.App.foreground({ timeout: 0 });
        const activeWindow = (await app.children()).find((window) => window.active);
        if (activeWindow?.bounds) {
          appName = app.name;
          region = activeWindow.bounds;
        }
      } catch {
        // A full desktop capture still helps the agent recover when the active
        // process does not expose an accessibility window.
      }
      const screenshot = await xa11y.screenshot(region ? { region } : {});
      const png = screenshot.toPng();
      return {
        app: appName,
        screenshot: {
          mimeType: "image/png" as const,
          data: Buffer.from(png).toString("base64"),
          width: screenshot.width,
          height: screenshot.height,
        },
      };
    }),
  computer_click: (input) =>
    withComputerAccess("computer_click", async () => {
      const { inputSim } = await import("@crowecawcaw/xa11y");
      await inputSim().click([input.x, input.y]);
      return { ok: true };
    }),
  computer_type_text: (input) =>
    withComputerAccess("computer_type_text", async () => {
      const { inputSim } = await import("@crowecawcaw/xa11y");
      await inputSim().typeText(input.text);
      return { ok: true };
    }),
  computer_press_key: (input) =>
    withComputerAccess("computer_press_key", async () => {
      const { inputSim } = await import("@crowecawcaw/xa11y");
      await inputSim().press(input.key);
      return { ok: true };
    }),
} satisfies Parameters<typeof ComputerStandardToolkit.toLayer>[0] &
  Parameters<typeof ComputerScreenshotToolkit.toLayer>[0];

const { computer_screenshot, ...standardHandlers } = handlers;

export const ComputerStandardToolkitHandlersLive =
  ComputerStandardToolkit.toLayer(standardHandlers);
export const ComputerScreenshotToolkitHandlersLive = ComputerScreenshotToolkit.toLayer({
  computer_screenshot,
});
