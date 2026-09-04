// Guards scripts that are meant to run against PRODUCTION (the inverse of
// assert-dev-database.ts's guard). Used only by intentional, one-off
// production migration/maintenance scripts — never by seed/backfill/dev
// tooling, which must keep using assertDevDatabase instead.
//
// Fails closed with a POSITIVE assertion: the host must exactly equal the
// known production host. It is not enough for the host to merely "not be
// dev" — an unrecognized or misconfigured DATABASE_URL is refused the same
// as a dev one. Confirmation is gated by CONFIRM_PRODUCTION_MIGRATION, a
// name deliberately distinct from the dev flow's ALLOW_DESTRUCTIVE_DB_SCRIPT
// so a stale dev env var can never satisfy this check.

import { PRODUCTION_DATABASE_HOST, getDatabaseHost } from "./assert-dev-database";

function fail(scriptName: string, message: string): never {
  console.error(`\n[assert-production-database] BLOCKED: ${scriptName}\n${message}\n`);
  process.exit(1);
}

export function assertProductionDatabase(scriptName: string): void {
  const host = getDatabaseHost();

  if (host !== PRODUCTION_DATABASE_HOST) {
    fail(
      scriptName,
      `DATABASE_URL host (${host}) does not exactly match the known PRODUCTION host (${PRODUCTION_DATABASE_HOST}). Refusing to run.`
    );
  }

  if (process.env.CONFIRM_PRODUCTION_MIGRATION !== "true") {
    fail(
      scriptName,
      `Set CONFIRM_PRODUCTION_MIGRATION=true to confirm you intend to run this against PRODUCTION (${host}).`
    );
  }
}
