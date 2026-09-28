import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

/** Pointer input the sidekick page reports to the main process. */
export const SidekickWindowInput = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(["drag-start", "drag-end", "click", "context-menu", "collapse"]),
  }),
  Schema.Struct({ type: Schema.Literal("drag-move"), dx: Schema.Finite, dy: Schema.Finite }),
  /** Hovered with threads to list; the size is the rendered list's. */
  Schema.Struct({
    type: Schema.Literal("expand"),
    width: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1_000 })),
    height: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1_000 })),
  }),
  Schema.Struct({
    type: Schema.Literal("open-thread"),
    environmentId: EnvironmentId,
    threadId: ThreadId,
  }),
]);
export type SidekickWindowInput = typeof SidekickWindowInput.Type;

/** How the page lays out the sprite and its hover list inside the window. */
export type SidekickWindowLayout =
  | { readonly expanded: false }
  | {
      readonly expanded: true;
      readonly size: number;
      readonly gap: number;
      readonly placement: "above" | "below";
      readonly align: "start" | "end";
    };
