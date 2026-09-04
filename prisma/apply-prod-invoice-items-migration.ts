// Applies prisma/manual-migrations/2026-09-04-invoice-items.sql to PRODUCTION.
// Purely additive: CREATE TABLE "InvoiceItem" + one index. Does not ALTER,
// UPDATE, or DELETE any existing table or row.
//
// Safety, in order:
//   1. assertProductionDatabase — positive host match + CONFIRM_PRODUCTION_MIGRATION=true
//      (a flag distinct from the dev flow's ALLOW_DESTRUCTIVE_DB_SCRIPT)
//   2. idempotency check — abort if "InvoiceItem" already exists, or a matching
//      row is already recorded as finished in _prisma_migrations
//   3. read-only baseline row counts across every existing table, printed
//      before anything is written
//   4. the migration SQL is read verbatim from the manual-migrations file and
//      executed inside a single transaction — never hand-copied, so what runs
//      is guaranteed to match the reviewed file byte-for-byte
//   5. baseline re-captured after commit and diffed against the pre-migration
//      counts; every existing table's row count must be unchanged

import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/apply-prod-invoice-items-migration.ts");

const MIGRATION_FILE = join(__dirname, "manual-migrations", "2026-09-04-invoice-items.sql");

const EXISTING_TABLES = [
  "User",
  "PasswordResetToken",
  "Client",
  "Invoice",
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

async function alreadyRecordedInMigrationHistory(client: Client): Promise<boolean> {
  if (!(await tableExists(client, "_prisma_migrations"))) return false;
  const result = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name ILIKE '%invoice_item%' AND finished_at IS NOT NULL`
  );
  return (result.rowCount ?? 0) > 0;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log(`Connected to ${new URL(process.env.DATABASE_URL!).hostname}`);

    if (await tableExists(client, "InvoiceItem")) {
      console.log('"InvoiceItem" already exists in production — nothing to do. Aborting.');
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
      console.error(`\nUNEXPECTED: row count changed on existing table(s): ${unexpectedChanges.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll existing table row counts unchanged.");
    }

    const invoiceItemCount = await client.query(`SELECT COUNT(*)::int AS count FROM "InvoiceItem"`);
    console.log(`"InvoiceItem" now exists with ${invoiceItemCount.rows[0].count} row(s) (expected 0).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
