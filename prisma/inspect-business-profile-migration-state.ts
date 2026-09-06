// Read-only investigation script. Does not write anything.
//
// check-prod-migrations (CI) reports 20260905100437_add_business_profile_fields
// as unapplied in production, even though apply-prod-add-business-profile-migration.ts
// was run against production and reported a clean commit. This checks two
// things directly against production instead of guessing:
//   1. Do the 7 columns it adds actually exist on "Settings" right now?
//   2. Does _prisma_migrations have any row for this migration, and what
//      does its finished_at/rolled_back_at state say?
//
// Leading hypothesis (unconfirmed until this runs): apply-prod-add-business-profile-migration.ts
// runs the migration's raw SQL through a plain `pg` Client, which changes
// the schema but never writes to _prisma_migrations — that table is
// normally updated by `prisma migrate deploy`/`resolve`, not by hand-run
// SQL. The other two migrations touched this session (invoice-items,
// active-receipt-template) each have a matching resolve-prod-*.ts sibling
// that calls `prisma migrate resolve --applied`; no such script exists for
// this migration, so the resolve step may simply be missing.
//
// Guard: positive production-host match only, no CONFIRM_PRODUCTION_MIGRATION
// requirement — this never writes, so it doesn't need the destructive-action
// gate that assertProductionDatabase enforces for write-capable scripts.

import "dotenv/config";
import { Client } from "pg";
import { PRODUCTION_DATABASE_HOST, getDatabaseHost } from "./assert-dev-database";

const MIGRATION_NAME = "20260905100437_add_business_profile_fields";
const EXPECTED_COLUMNS = [
  "businessEmail",
  "businessName",
  "businessPhone",
  "businessType",
  "country",
  "logoUrl",
  "onboardingCompletedAt",
];

const host = getDatabaseHost();
if (host !== PRODUCTION_DATABASE_HOST) {
  console.error(
    `\n[inspect-business-profile-migration-state] BLOCKED: DATABASE_URL host (${host}) does not match ` +
      `the known PRODUCTION host (${PRODUCTION_DATABASE_HOST}). Point DATABASE_URL at production to run this.\n`
  );
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log(`Connected to ${host}\n`);

    console.log("=== 1. Do the 7 columns exist on \"Settings\" right now? ===");
    const columnsResult = await client.query(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Settings' AND column_name = ANY($1::text[])
       ORDER BY column_name`,
      [EXPECTED_COLUMNS]
    );
    const foundColumns = new Set(columnsResult.rows.map((r) => r.column_name));
    console.table(columnsResult.rows);
    const missing = EXPECTED_COLUMNS.filter((c) => !foundColumns.has(c));
    console.log(
      missing.length === 0
        ? "All 7 expected columns are present.\n"
        : `MISSING columns: ${missing.join(", ")}\n`
    );

    console.log(`=== 2. _prisma_migrations row(s) for "${MIGRATION_NAME}" ===`);
    const migrationRows = await client.query(
      `SELECT id, migration_name, started_at, finished_at, applied_steps_count, rolled_back_at, logs
       FROM "_prisma_migrations"
       WHERE migration_name = $1
       ORDER BY started_at`,
      [MIGRATION_NAME]
    );
    if (migrationRows.rowCount === 0) {
      console.log("No row found for this migration_name in _prisma_migrations at all.\n");
    } else {
      console.table(
        migrationRows.rows.map((r) => ({
          ...r,
          logs: r.logs ? String(r.logs).slice(0, 200) : r.logs,
        }))
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
