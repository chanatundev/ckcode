import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Migrator from "effect/unstable/sql/Migrator";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { migrationManifest, runMigrations } from "./Migrations.ts";
import { reconcileCkcodeMigrations } from "./reconcileCkcodeMigrations.ts";

describe("CKcode migration reconciliation", () => {
  it.effect("replaces the fork's migration 55 and runs the upstream V2 migrations", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 54 });
      const upstreamHistory = yield* sql`
        SELECT * FROM effect_sql_migrations ORDER BY migration_id
      `;
      yield* Migrator.make({})({
        loader: Migrator.fromRecord({
          "55_ProjectionThreadGoal": sql`
            ALTER TABLE projection_threads ADD COLUMN goal TEXT
          `,
        }),
      });

      assert.deepStrictEqual(yield* runMigrations(), [
        [55, "OrchestrationV2"],
        [56, "RemoveRedundantProjectionIndexes"],
      ]);
      assert.deepStrictEqual(
        yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 54 ORDER BY migration_id`,
        upstreamHistory,
      );
      const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
      `;
      assert.deepStrictEqual(
        history.map((row) => [row.migration_id, row.name] as const),
        migrationManifest,
      );
      assert.deepStrictEqual(
        yield* sql`
          SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (
            'orchestration_v2_events',
            'orchestration_v2_legacy_imports',
            'orchestration_v2_projection_threads'
          ) ORDER BY name
        `,
        [
          { name: "orchestration_v2_events" },
          { name: "orchestration_v2_legacy_imports" },
          { name: "orchestration_v2_projection_threads" },
        ],
      );
      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(projection_threads)`;
      assert.ok(columns.some((column) => column.name === "goal"));
      assert.deepStrictEqual(
        yield* sql`SELECT name FROM sqlite_master WHERE name = 'idx_projection_threads_project_id'`,
        [],
      );
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("leaves a clean database untouched before normal upstream migrations", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const schema = yield* sql`SELECT * FROM sqlite_master ORDER BY name`;
      yield* reconcileCkcodeMigrations();
      assert.deepStrictEqual(yield* sql`SELECT * FROM sqlite_master ORDER BY name`, schema);
      assert.deepStrictEqual(yield* runMigrations(), migrationManifest);
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("preserves an already-V2 database's ledger and import progress", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      yield* sql`
        INSERT INTO orchestration_v2_legacy_imports
          (thread_id, source_updated_at, shell_imported_at, transcript_imported_at, imported_message_count)
        VALUES ('fork-thread', '2026-10-04', '2026-10-04', '2026-10-04', 42)
      `;
      const history = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
      const imports = yield* sql`SELECT * FROM orchestration_v2_legacy_imports`;
      assert.deepStrictEqual(yield* runMigrations(), []);
      assert.deepStrictEqual(
        yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
        history,
      );
      assert.deepStrictEqual(yield* sql`SELECT * FROM orchestration_v2_legacy_imports`, imports);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
