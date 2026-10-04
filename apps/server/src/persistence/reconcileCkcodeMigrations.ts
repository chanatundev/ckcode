import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Fork schema must never claim upstream migration ids; use idempotent ensure steps instead.
export const reconcileCkcodeMigrations = Effect.fn("reconcileCkcodeMigrations")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const tables = yield* sql`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
      `;
      if (tables.length === 0) return;

      // The fork's old goal column can stay, but its ledger entry skips upstream V2's schema.
      yield* sql`
        DELETE FROM effect_sql_migrations
        WHERE migration_id = 55 AND name = 'ProjectionThreadGoal'
      `;
    }),
  );
});
