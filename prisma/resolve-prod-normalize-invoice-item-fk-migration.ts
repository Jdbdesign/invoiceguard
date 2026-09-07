// One-time production reconciliation: marks the normalize-invoice-item-fk
// migration as finished in _prisma_migrations via `prisma migrate resolve
// --applied`, using the formal migration folder at
// prisma/migrations/20260906133130_normalize_invoice_item_fk.
//
// This runs no SQL — it only records history, so `prisma migrate status`
// and future `prisma migrate deploy` runs stop seeing drift on production.
//
// Must only be run after apply-prod-normalize-invoice-item-fk-migration.ts
// has succeeded and confirmed "InvoiceItem_invoiceId_fkey" has
// update_rule=CASCADE/delete_rule=RESTRICT with baseline counts unchanged.
//
// Wrapped in the same production guard as the migration itself: `prisma
// migrate resolve` is a raw CLI call and would otherwise bypass the
// host/flag safety net entirely.

import "dotenv/config";
import { spawnSync } from "child_process";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/resolve-prod-normalize-invoice-item-fk-migration.ts");

const MIGRATION_NAME = "20260906133130_normalize_invoice_item_fk";

console.log(`Running: npx prisma migrate resolve --applied ${MIGRATION_NAME}`);

const result = spawnSync("npx", ["prisma", "migrate", "resolve", "--applied", MIGRATION_NAME], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
