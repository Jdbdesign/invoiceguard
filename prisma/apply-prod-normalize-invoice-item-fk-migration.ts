// Applies prisma/migrations/20260906133130_normalize_invoice_item_fk to
// PRODUCTION. Purely a constraint-definition change: drops and recreates
// "InvoiceItem_invoiceId_fkey" so its ON DELETE/ON UPDATE actions match what
// Prisma's schema-diffing expects (RESTRICT/CASCADE) instead of Postgres's
// implicit NO ACTION/NO ACTION left over from an earlier hand-written
// migration. No column or row is touched by this migration.
//
// Safety, in order:
//   1. assertProductionDatabase — positive host match + CONFIRM_PRODUCTION_MIGRATION=true
//   2. idempotency check — read the LIVE constraint's update_rule/delete_rule
//      from information_schema and abort if it's already CASCADE/RESTRICT
//      (more reliable than checking _prisma_migrations alone, since it
//      verifies actual database state rather than just a history record)
//   3. read-only baseline row counts across every existing table, printed
//      before anything is written
//   4. the migration SQL is read verbatim from the migration file and
//      executed inside a single transaction — never hand-copied
//   5. baseline re-captured after commit and diffed against the
//      pre-migration counts; every table's row count must be unchanged
//      (this migration only redefines a constraint)

import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/apply-prod-normalize-invoice-item-fk-migration.ts");

const MIGRATION_FILE = join(
  __dirname,
  "migrations",
  "20260906133130_normalize_invoice_item_fk",
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

async function getInvoiceItemFkRules(
  client: Client
): Promise<{ update_rule: string; delete_rule: string } | null> {
  const result = await client.query(
    `SELECT rc.update_rule, rc.delete_rule
     FROM information_schema.referential_constraints rc
     JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.constraint_schema
     WHERE tc.table_name = 'InvoiceItem' AND tc.constraint_name = 'InvoiceItem_invoiceId_fkey'`
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return result.rows[0];
}

async function alreadyApplied(client: Client): Promise<boolean> {
  const rules = await getInvoiceItemFkRules(client);
  if (!rules) return false;
  return rules.update_rule === "CASCADE" && rules.delete_rule === "RESTRICT";
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log(`Connected to ${new URL(process.env.DATABASE_URL!).hostname}`);

    if (!(await tableExists(client, "InvoiceItem"))) {
      throw new Error('"InvoiceItem" table does not exist in production — refusing to proceed.');
    }

    if (await alreadyApplied(client)) {
      console.log(
        '"InvoiceItem_invoiceId_fkey" already has update_rule=CASCADE/delete_rule=RESTRICT in production — nothing to do. Aborting.'
      );
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
      console.log("\nAll table row counts unchanged (as expected — this migration only redefines a constraint).");
    }

    const rulesAfter = await getInvoiceItemFkRules(client);
    console.log(
      `"InvoiceItem_invoiceId_fkey" now: update_rule=${rulesAfter?.update_rule}, delete_rule=${rulesAfter?.delete_rule} (expected: CASCADE/RESTRICT)`
    );
    if (rulesAfter?.update_rule !== "CASCADE" || rulesAfter?.delete_rule !== "RESTRICT") {
      console.error("UNEXPECTED: constraint rules do not match expected CASCADE/RESTRICT after migration.");
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
