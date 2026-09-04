// Applies prisma/migrations/20260903140623_add_active_receipt_template_id
// to PRODUCTION. Purely additive: a single ALTER TABLE ADD COLUMN with a
// DEFAULT, backfilling every existing Settings row to 'default' (the
// pre-existing emerald template) without touching any other column or row.
//
// Safety, in order:
//   1. assertProductionDatabase — positive host match + CONFIRM_PRODUCTION_MIGRATION=true
//      (a flag distinct from the dev flow's ALLOW_DESTRUCTIVE_DB_SCRIPT)
//   2. idempotency check — abort if "Settings"."activeReceiptTemplateId"
//      already exists, or a matching row is already recorded as finished
//      in _prisma_migrations
//   3. read-only baseline row counts across every existing table, printed
//      before anything is written
//   4. the migration SQL is read verbatim from the migration file and
//      executed inside a single transaction — never hand-copied, so what
//      runs is guaranteed to match the reviewed file byte-for-byte
//   5. baseline re-captured after commit and diffed against the
//      pre-migration counts; every table's row count must be unchanged
//      (this migration adds a column, not rows)

import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/apply-prod-active-receipt-template-migration.ts");

const MIGRATION_FILE = join(
  __dirname,
  "migrations",
  "20260903140623_add_active_receipt_template_id",
  "migration.sql"
);

const EXISTING_TABLES = [
  "User",
  "PasswordResetToken",
  "Client",
  "Invoice",
  "InvoiceItem",
  "ActivityLog",
  "PaymentPlan",
  "Installment",
  "ShareLink",
  "Settings",
];

async function captureBaseline(client: Client): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of EXISTING_TABLES) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

async function tableExists(client: Client, tableName: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return (result.rowCount ?? 0) > 0;
}

async function columnExists(client: Client, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return (result.rowCount ?? 0) > 0;
}

async function alreadyRecordedInMigrationHistory(client: Client): Promise<boolean> {
  if (!(await tableExists(client, "_prisma_migrations"))) return false;
  const result = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name ILIKE '%active_receipt_template%' AND finished_at IS NOT NULL`
  );
  return (result.rowCount ?? 0) > 0;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log(`Connected to ${new URL(process.env.DATABASE_URL!).hostname}`);

    if (await columnExists(client, "Settings", "activeReceiptTemplateId")) {
      console.log('"Settings"."activeReceiptTemplateId" already exists in production — nothing to do. Aborting.');
      return;
    }
    if (await alreadyRecordedInMigrationHistory(client)) {
      console.log("A matching migration is already recorded as finished in _prisma_migrations — aborting.");
      return;
    }

    console.log("\n=== BASELINE (before) ===");
    const before = await captureBaseline(client);
    console.table(before);

    const sql = readFileSync(MIGRATION_FILE, "utf-8");
    console.log(`\n=== SQL to execute (read verbatim from ${MIGRATION_FILE}) ===\n`);
    console.log(sql);

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
      console.log("Migration committed.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log("\n=== BASELINE (after) ===");
    const after = await captureBaseline(client);
    console.table(after);

    const unexpectedChanges = EXISTING_TABLES.filter((table) => before[table] !== after[table]);
    if (unexpectedChanges.length > 0) {
      console.error(`\nUNEXPECTED: row count changed on table(s): ${unexpectedChanges.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll table row counts unchanged (as expected for a column addition).");
    }

    const defaultCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM "Settings" WHERE "activeReceiptTemplateId" = 'default'`
    );
    const totalSettings = after["Settings"];
    console.log(
      `"activeReceiptTemplateId" now exists; ${defaultCount.rows[0].count} of ${totalSettings} Settings row(s) backfilled to 'default' (expected: all of them).`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
