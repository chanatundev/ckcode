import { McpCapabilityUnavailableError, TrimmedNonEmptyString } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [McpInvocationContext.McpInvocationContext];

export class ComputerOperationError extends Schema.TaggedError<ComputerOperationError>()(
  "ComputerOperationError",
  {
    operation: TrimmedNonEmptyString,
    reason: TrimmedNonEmptyString,
  },
) {
  override get message(): string {
    return `Desktop computer operation '${this.operation}' failed: ${this.reason}`;
  }
}

export const ComputerToolError = Schema.Union([
  McpCapabilityUnavailableError,
  ComputerOperationError,
]);

const ComputerAppsTool = Tool.make("computer_list_apps", {
  description:
    "List running desktop applications visible to the native accessibility API. Use the exact app name with computer_activate_app or computer_accessibility_tree.",
  parameters: Schema.Struct({
    limit: Schema.optional(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })).annotate({
        description: "Maximum apps to return (1–100, default 50).",
      }),
    ),
  }),
  success: Schema.Struct({
    apps: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        pid: Schema.NullOr(Schema.Int),
        foreground: Schema.Boolean,
      }),
    ),
    truncated: Schema.Boolean,
  }),
  failure: ComputerToolError,
  dependencies,
})
  .annotate(Tool.Title, "List desktop apps")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const ComputerAccessibilityTreeTool = Tool.make("computer_accessibility_tree", {
  description:
    "Inspect an app's accessibility tree. Omit app to inspect the active desktop app. The bounded tree includes roles, names, values, and actionable controls.",
  parameters: Schema.Struct({
    app: Schema.optional(TrimmedNonEmptyString),
    maxDepth: Schema.optional(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })).annotate({
        description: "Maximum accessibility tree depth (1–12, default 6).",
      }),
    ),
  }),
  success: Schema.Struct({
    app: Schema.String,
    pid: Schema.NullOr(Schema.Int),
    tree: Schema.String,
    truncated: Schema.Boolean,
  }),
  failure: ComputerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Inspect desktop accessibility tree")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const ComputerActivateAppTool = Tool.make("computer_activate_app", {
  description:
    "Bring a desktop application window to the foreground. Pass window for an exact window title when the app has multiple windows; otherwise its active or first window is used.",
  parameters: Schema.Struct({
    app: TrimmedNonEmptyString,
    window: Schema.optional(TrimmedNonEmptyString),
  }),
  success: Schema.Struct({ app: Schema.String, window: Schema.String }),
  failure: ComputerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Activate desktop app")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const ComputerScreenshotTool = Tool.make("computer_screenshot", {
  description:
    "Capture a PNG screenshot of the active desktop app's window and return it as an image. If no accessible foreground window is available, captures the desktop.",
  parameters: Schema.Struct({
    includeImage: Schema.optional(Schema.Boolean.annotate({
      description: "Include image content in the result (default true).",
    })),
  }),
  success: Schema.Struct({
    app: Schema.NullOr(Schema.String),
    screenshot: Schema.Struct({
      mimeType: Schema.Literal("image/png"),
      data: Schema.String,
      width: Schema.Int,
      height: Schema.Int,
    }),
  }),
  failure: ComputerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Capture desktop screenshot")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

const ComputerClickTool = Tool.make("computer_click", {
  description:
    "Click a desktop screen coordinate. Coordinates use the desktop coordinate space reported by the accessibility tree and screenshot.",
  parameters: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
  success: Schema.Struct({ ok: Schema.Boolean }),
  failure: ComputerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Click desktop")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

const ComputerTypeTextTool = Tool.make("computer_type_text", {
  description:
    "Type literal text into the desktop control that currently has keyboard focus.",
  parameters: Schema.Struct({
    text: Schema.String.check(Schema.isMaxLength(4_000)),
  }),
  success: Schema.Struct({ ok: Schema.Boolean }),
  failure: ComputerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Type desktop text")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

const ComputerPressKeyTool = Tool.make("computer_press_key", {
  description:
    "Press one named keyboard key, such as Enter, Escape, ArrowDown, or F5, in the active desktop app.",
  parameters: Schema.Struct({ key: TrimmedNonEmptyString }),
  success: Schema.Struct({ ok: Schema.Boolean }),
  failure: ComputerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Press desktop key")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

export const ComputerStandardToolkit = Toolkit.make(
  ComputerAppsTool,
  ComputerAccessibilityTreeTool,
  ComputerActivateAppTool,
  ComputerClickTool,
  ComputerTypeTextTool,
  ComputerPressKeyTool,
);
export const ComputerScreenshotToolkit = Toolkit.make(ComputerScreenshotTool);
export const ComputerToolkit = Toolkit.make(
  ComputerAppsTool,
  ComputerAccessibilityTreeTool,
  ComputerActivateAppTool,
  ComputerScreenshotTool,
  ComputerClickTool,
  ComputerTypeTextTool,
  ComputerPressKeyTool,
);
