import { TrimmedNonEmptyString } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as OrchestrationEngine from "../../../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";

export class StartThreadError extends Schema.TaggedError<StartThreadError>()("StartThreadError", {
  reason: TrimmedNonEmptyString,
}) {
  override get message(): string {
    return `Could not start an independent thread: ${this.reason}`;
  }
}

export const StartThreadToolError = StartThreadError;

const StartThreadTool = Tool.make("start_thread", {
  description:
    "Start an independent thread in the same project and workspace as the current thread. Use this to delegate separate work through the T3 Code MCP server. The new thread starts immediately with the supplied prompt and inherits the current thread's provider, model, runtime mode, branch, and worktree.",
  parameters: Schema.Struct({
    prompt: TrimmedNonEmptyString.check(Schema.isMaxLength(16_000)).annotate({
      description: "The task the new thread should work on.",
    }),
    title: Schema.optional(
      TrimmedNonEmptyString.check(Schema.isMaxLength(160)).annotate({
        description: "Optional title for the independent thread.",
      }),
    ),
  }),
  success: Schema.Struct({
    threadId: Schema.String,
    title: Schema.String,
    projectId: Schema.String,
  }),
  failure: StartThreadToolError,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    OrchestrationEngine.OrchestrationEngineService,
    ProjectionSnapshotQuery.ProjectionSnapshotQuery,
  ],
})
  .annotate(Tool.Title, "Start independent thread")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

export const ThreadsToolkit = Toolkit.make(StartThreadTool);
