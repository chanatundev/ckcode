import * as Schema from "effect/Schema";

/** Pointer input the sidekick page reports to the main process. */
export const SidekickWindowInput = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["drag-start", "drag-end", "click", "context-menu"]) }),
  Schema.Struct({ type: Schema.Literal("drag-move"), dx: Schema.Finite, dy: Schema.Finite }),
]);
export type SidekickWindowInput = typeof SidekickWindowInput.Type;
