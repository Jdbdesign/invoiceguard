// Read-only pre-deploy gate: fails loudly if Vercel's PRODUCTION environment
// is missing any of the env vars that email sending depends on.
//
// Added after RECEIPT_FROM_ADDRESS shipped in code without ever being added
// to Vercel — that made every payment-receipt email in production silently
// fail (falling back to Resend's sandbox sender, which can't deliver to
// real recipients) with nothing visible anywhere a human would routinely
// check. This pairs with the runtime guard in src/lib/email.ts
// (resolveFromAddress), which refuses that silent fallback in production;
// this script's job is to make sure the guard is never actually triggered
// by catching the gap before deploy, not after.
//
// Pulls Vercel's real Production env vars via `vercel pull` rather than
// trusting this checkout's local .env or the README's documented list, so
// it reflects what's actually configured. Requires VERCEL_TOKEN,
// VERCEL_ORG_ID, and VERCEL_PROJECT_ID (see README.md for how to obtain
// these) — non-interactive linking in CI needs all three.

import { existsSync, readFileSync, rmSync } from "fs";
import { spawnSync } from "child_process";
import { parse } from "dotenv";

const REQUIRED_VARS = [
  "RESEND_API_KEY",
  "REMINDER_FROM_ADDRESS",
  "RECEIPT_FROM_ADDRESS",
  "RESET_PASSWORD_FROM_ADDRESS",
];

const PULLED_ENV_PATH = ".vercel/.env.production.local";

function fail(message: string): never {
  console.error(`\n[check-required-env] BLOCKED: ${message}\n`);
  process.exit(1);
}

for (const name of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
  if (!process.env[name]) {
    fail(`${name} is not set — cannot pull Vercel's Production environment variables.`);
  }
}

console.log("Pulling Vercel Production environment variables...\n");

const result = spawnSync(
  "npx",
  ["--yes", "vercel@latest", "pull", "--yes", "--environment=production"],
  { stdio: "inherit", shell: process.platform === "win32" }
);

if ((result.status ?? 1) !== 0) {
  fail("`vercel pull` failed — see output above.");
}

if (!existsSync(PULLED_ENV_PATH)) {
  fail(`Expected ${PULLED_ENV_PATH} after \`vercel pull\` but it wasn't created.`);
}

const pulled = parse(readFileSync(PULLED_ENV_PATH));
rmSync(PULLED_ENV_PATH, { force: true });

const missing = REQUIRED_VARS.filter((name) => !pulled[name]);

if (missing.length > 0) {
  fail(
    `Production is missing: ${missing.join(", ")}. ` +
      "Set these in Vercel Project Settings -> Environment Variables (Production) before deploying " +
      "— without them, the affected email type stops sending entirely (see README.md's Environment Variables section)."
  );
}

console.log(
  `\n[check-required-env] OK: all required env vars are set in production (${REQUIRED_VARS.join(", ")}).\n`
);
