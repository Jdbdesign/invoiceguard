// Read-only pre-deploy gate: fails loudly if PRODUCTION has migrations that
// haven't been applied yet. Added after the first schema change following
// assertProductionDatabase's introduction shipped to prod with a migration
// still pending — nothing in the deploy process checked for that.
//
// Unlike assertProductionDatabase, this does NOT require
// CONFIRM_PRODUCTION_MIGRATION: it never writes anything, so it's meant to
// run unattended on every deploy, not just intentional one-off migration
// runs. It still positively asserts the DATABASE_URL host is the known
// production host, so it can never mistake a clean dev database for a clean
// production one.
//
// Runs `prisma migrate status` under the hood. As of Prisma 4.3.0+ (this
// repo is on 7.9.1), that command exits 1 for unapplied migrations, a
// diverged history, a missing migration table, or a database connection
// error — and 0 only when the database is fully up to date. That exit code
// is what this script gates on.

import "dotenv/config";
import { spawnSync } from "child_process";
import { PRODUCTION_DATABASE_HOST, getDatabaseHost } from "./assert-dev-database";

function fail(message: string): never {
  console.error(`\n[check-pending-migrations] BLOCKED: ${message}\n`);
  process.exit(1);
}

const host = getDatabaseHost();
if (host !== PRODUCTION_DATABASE_HOST) {
  fail(
    `DATABASE_URL host (${host}) does not match the known PRODUCTION host (${PRODUCTION_DATABASE_HOST}). ` +
      `Point DATABASE_URL at production before running this pre-deploy check.`
  );
}

console.log(`Checking migration status against production (${host})...\n`);

const result = spawnSync("npx", ["prisma", "migrate", "status"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

const exitCode = result.status ?? 1;

if (exitCode !== 0) {
  console.error(
    "\n[check-pending-migrations] BLOCKED: production has unapplied migrations, a diverged " +
      "migration history, or could not be reached (see `prisma migrate status` output above). " +
      "Do not deploy until this is resolved.\n"
  );
  process.exit(1);
}

console.log("\n[check-pending-migrations] OK: production migration history is up to date. Safe to deploy.\n");
