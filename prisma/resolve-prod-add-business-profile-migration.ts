// One-time production reconciliation: marks the business-profile-fields
// migration as finished in _prisma_migrations via `prisma migrate resolve
// --applied`, using the formal migration folder at
// prisma/migrations/20260905100437_add_business_profile_fields.
//
// This runs no SQL — it only records history, so `prisma migrate status`
// and future `prisma migrate deploy` runs stop seeing drift on production.
//
// Must only be run after apply-prod-add-business-profile-migration.ts has
// succeeded and confirmed all 7 columns exist with baseline counts
// unchanged (confirmed via inspect-business-profile-migration-state.ts:
// all 7 columns present, no _prisma_migrations row for this migration).
//
// Wrapped in the same production guard as the migration itself: `prisma
// migrate resolve` is a raw CLI call and would otherwise bypass the
// host/flag safety net entirely.

import "dotenv/config";
import { spawnSync } from "child_process";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/resolve-prod-add-business-profile-migration.ts");

const MIGRATION_NAME = "20260905100437_add_business_profile_fields";

console.log(`Running: npx prisma migrate resolve --applied ${MIGRATION_NAME}`);

const result = spawnSync("npx", ["prisma", "migrate", "resolve", "--applied", MIGRATION_NAME], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
