// Wraps `prisma migrate dev` so it goes through the same production-safety
// check as seed.ts and backfill-default-owner.ts before touching the database.
// Invoked via `npm run db:migrate` (see package.json) instead of calling
// `prisma migrate dev` directly.
import "dotenv/config";
import { spawnSync } from "child_process";
import { assertDevDatabase } from "./assert-dev-database";

assertDevDatabase("prisma migrate dev (via npm run db:migrate)");

const extraArgs = process.argv.slice(2);
const result = spawnSync("npx", ["prisma", "migrate", "dev", ...extraArgs], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
