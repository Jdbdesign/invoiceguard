// prisma/apply-prod-add-bank-statement-extraction-method-migration.ts
// Applies prisma/migrations/<timestamp>_add_bank_statement_extraction_method
// to PRODUCTION. Purely additive: a single ALTER TABLE ADD COLUMN with a
// DEFAULT, backfilling every existing Settings row to 'ai' without touching
// any other column or row.
//
// Safety, in order:
//   1. assertProductionDatabase — positive host match + CONFIRM_PRODUCTION_MIGRATION=true
//   2. idempotency check — abort if "Settings"."bankStatementExtractionMethod"
//      already exists, or a matching row is already recorded as finished
//      in _prisma_migrations
//   3. read-only baseline row counts across every existing table, printed
//      before anything is written
//   4. the migration SQL is read verbatim from the migration file and
//      executed inside a single transaction — never hand-copied
//   5. baseline re-captured after commit and diffed against the
//      pre-migration counts; every table's row count must be unchanged

import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/apply-prod-add-bank-statement-extraction-method-migration.ts");

const MIGRATIONS_DIR = join(__dirname, "migrations");
const MIGRATION_DIR_NAME = readdirSync(MIGRATIONS_DIR).find((name) =>
  name.endsWith("_add_bank_statement_extraction_method")
);
if (!MIGRATION_DIR_NAME) {
  throw new Error(
    "Could not find a migrations/<timestamp>_add_bank_statement_extraction_method directory — run `npm run db:migrate` first."
  );
}
const MIGRATION_FILE = join(MIGRATIONS_DIR, MIGRATION_DIR_NAME, "migration.sql");

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
  "Payment",
  "BankStatementUpload",
  "BankTransaction",
];

async function captureBaseline(client: Client): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of EXISTING_TABLES) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

async function columnExists(client: Client, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return (result.rowCount ?? 0) > 0;
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
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name ILIKE '%add_bank_statement_extraction_method%' AND finished_at IS NOT NULL`
  );
  return (result.rowCount ?? 0) > 0;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log(`Connected to ${new URL(process.env.DATABASE_URL!).hostname}`);

    if (await columnExists(client, "Settings", "bankStatementExtractionMethod")) {
      console.log('"Settings"."bankStatementExtractionMethod" already exists in production — nothing to do. Aborting.');
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
      `SELECT COUNT(*)::int AS count FROM "Settings" WHERE "bankStatementExtractionMethod" = 'ai'`
    );
    const totalSettings = after["Settings"];
    console.log(
      `"bankStatementExtractionMethod" now exists; ${defaultCount.rows[0].count} of ${totalSettings} Settings row(s) backfilled to 'ai' (expected: all of them).`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
