import {
  CommandId,
  MessageId,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as OrchestrationEngine from "../../../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { StartThreadError, ThreadsToolkit } from "./tools.ts";

const handlers = {
  start_thread: (input) =>
    Effect.gen(function* () {
      const invocation = yield* McpInvocationContext.McpInvocationContext;
      const engine = yield* OrchestrationEngine.OrchestrationEngineService;
      const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
      const crypto = yield* Crypto.Crypto;
      const sourceThread = yield* snapshots.getThreadShellById(invocation.threadId).pipe(
        Effect.map(Option.getOrUndefined),
      );
      if (!sourceThread) {
        return yield* new StartThreadError({ reason: "The source thread is no longer available." });
      }
      const sourceProject = yield* snapshots.getProjectShellById(sourceThread.projectId).pipe(
        Effect.map(Option.getOrUndefined),
      );
      if (!sourceProject) {
        return yield* new StartThreadError({ reason: "The source project is no longer available." });
      }

      const uuid = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
      const threadId = ThreadId.make(uuid);
      const createdAt = new Date().toISOString();
      const title = input.title ?? input.prompt.replace(/\s+/g, " ").trim().slice(0, 80);
      const messageId = MessageId.make(yield* crypto.randomUUIDv4.pipe(Effect.orDie));
      const commandId = CommandId.make(`server:mcp-start-thread:${threadId}:${uuid}`);

      yield* engine
        .dispatch({
          type: "thread.turn.start",
          commandId,
          threadId,
          message: {
            messageId,
            role: "user",
            text: input.prompt,
            attachments: [],
          },
          modelSelection: sourceThread.modelSelection,
          titleSeed: title,
          runtimeMode: sourceThread.runtimeMode,
          interactionMode: sourceThread.interactionMode,
          bootstrap: {
            createThread: {
              projectId: sourceProject.id,
              title,
              modelSelection: sourceThread.modelSelection,
              runtimeMode: sourceThread.runtimeMode,
              interactionMode: sourceThread.interactionMode,
              branch: sourceThread.branch,
              worktreePath: sourceThread.worktreePath,
              createdAt,
            },
          },
          createdAt,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.fail(
              new StartThreadError({
                reason: Cause.pretty(cause).slice(0, 1_000) || "The server rejected the request.",
              }),
            ),
          ),
        );

      return { threadId, title, projectId: sourceProject.id };
    }),
} satisfies Parameters<typeof ThreadsToolkit.toLayer>[0];

export const ThreadsToolkitHandlersLive = ThreadsToolkit.toLayer(handlers);
