// Guards destructive/write-capable Prisma scripts (seed, backfill, migrate dev)
// against ever running against the production database again. On 2026-09-02,
// prisma/seed.ts ran with DATABASE_URL pointed at production and wiped real
// user data (recovered via Neon point-in-time restore) because every worktree's
// .env pointed at the same single database — nothing distinguished dev from prod.
//
// Fails closed: DEV_DATABASE_HOST is an unreachable placeholder until a real
// dedicated dev Neon branch exists, so every guarded script is blocked by
// default until that value is filled in.

const PRODUCTION_DATABASE_HOST = "ep-long-glitter-ayp4oqdg-pooler.c-5.us-east-2.aws.neon.tech";

const DEV_DATABASE_HOST = "ep-young-fire-ay9eieeg-pooler.c-5.us-east-2.aws.neon.tech";

function getDatabaseHost(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error(`DATABASE_URL is not a valid connection string: ${url}`);
  }
}

function fail(scriptName: string, message: string): never {
  console.error(`\n[assert-dev-database] BLOCKED: ${scriptName}\n${message}\n`);
  process.exit(1);
}

export function assertDevDatabase(scriptName: string): void {
  const host = getDatabaseHost();

  if (host === PRODUCTION_DATABASE_HOST) {
    fail(scriptName, `DATABASE_URL points at the known PRODUCTION host (${host}). Refusing to run.`);
  }

  if (host !== DEV_DATABASE_HOST) {
    fail(
      scriptName,
      `DATABASE_URL host (${host}) does not match the known dev-database host (${DEV_DATABASE_HOST}). Refusing to run.`
    );
  }

  if (process.env.ALLOW_DESTRUCTIVE_DB_SCRIPT !== "true") {
    fail(
      scriptName,
      `Set ALLOW_DESTRUCTIVE_DB_SCRIPT=true to confirm you intend to run this against ${host}.`
    );
  }
}
