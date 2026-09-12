// prisma/resolve-prod-add-bank-statement-extraction-method-migration.ts
// One-time production reconciliation: marks the
// add_bank_statement_extraction_method migration as finished in
// _prisma_migrations via `prisma migrate resolve --applied`.
//
// Runs no SQL — it only records history. Must only be run after
// apply-prod-add-bank-statement-extraction-method-migration.ts has
// succeeded and confirmed the column exists with row counts unchanged.

import "dotenv/config";
import { readdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/resolve-prod-add-bank-statement-extraction-method-migration.ts");

const MIGRATIONS_DIR = join(__dirname, "migrations");
const MIGRATION_DIR_NAME = readdirSync(MIGRATIONS_DIR).find((name) =>
  name.endsWith("_add_bank_statement_extraction_method")
);
if (!MIGRATION_DIR_NAME) {
  throw new Error("Could not find the add_bank_statement_extraction_method migration directory.");
}

console.log(`Running: npx prisma migrate resolve --applied ${MIGRATION_DIR_NAME}`);

const result = spawnSync("npx", ["prisma", "migrate", "resolve", "--applied", MIGRATION_DIR_NAME], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
