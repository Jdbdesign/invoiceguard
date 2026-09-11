# Traditional Bank Statement Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-selectable, non-AI (regex-based) bank statement extraction path alongside the existing Claude-based one, for the OWealth/GTBank-style statement format, with a per-owner setting, a warning banner, and a never-guess policy on ambiguous duplicate transactions.

**Architecture:** A new pure-function module (`traditionalBankStatementExtraction.ts`) parses the raw `pdf-parse` text via anchor-based chunking on the `DD Mon YYYY HH:MM:SS DD Mon YYYY` row marker, flags conflicting-sign duplicates as `needsReview` rather than guessing, and cross-checks its own row counts against the statement's self-declared `Credit Count`/`Debit Count`. A new `Settings.bankStatementExtractionMethod` field (per-owner, like every other Settings field) routes `POST /api/bank-statements` to this parser instead of the Claude one; a `lowConfidenceReasons` response field (never persisted) drives an upload-screen retry-with-AI affordance.

**Tech Stack:** Next.js App Router, Prisma 7 (PostgreSQL), TypeScript, vitest (pure-logic unit tests, existing convention in this repo — no route-level test harness exists, verify those manually).

**Spec:** `docs/superpowers/specs/2026-09-11-traditional-bank-statement-extraction-design.md`

## Global Constraints

- `status`/method fields are plain `String`, never a Prisma `enum` (matches every existing field in `Settings`).
- No `Organization`/`Account` layer exists — all per-owner settings key off `ownerId: String` on `Settings`, unique per `User`.
- IDs: `cuid()`. No `updatedAt` field on any model. Money is `Float`. (Existing schema conventions — irrelevant to this feature's one new column but stated for consistency.)
- No test-DB harness exists in this codebase — API routes and DB-touching scripts are verified manually via the dev server / Prisma Studio, never given a new testing harness as part of this plan.
- Package manager is npm. Hosting is Vercel.
- **Migration approval gate (standing project rule):** before running `npm run db:migrate` (or any command that applies schema changes) against ANY database, including local dev, the exact generated migration SQL must be shown to the user for explicit approval. This is non-negotiable even for additive/low-risk changes — do not skip it.

---

### Task 1: Traditional extraction module

**Files:**
- Modify: `src/lib/bankStatementExtraction.ts` (extend `ParsedStatementRow`)
- Create: `src/lib/traditionalBankStatementExtraction.ts`
- Test: `src/lib/traditionalBankStatementExtraction.test.ts`

**Interfaces:**
- Consumes: nothing new — pure string-processing.
- Produces: `ParsedStatementRow { date: string; description: string; amount: number; needsReview?: boolean; reviewReason?: string }` (extended), `extractTraditional(statementText: string): { rows: ParsedStatementRow[]; lowConfidenceReasons: string[] }` — consumed by Task 5.

- [ ] **Step 1: Extend `ParsedStatementRow`**

In `src/lib/bankStatementExtraction.ts`, change:

```ts
export interface ParsedStatementRow {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number; // positive = credit/deposit, negative = debit
}
```

to:

```ts
export interface ParsedStatementRow {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number; // positive = credit/deposit, negative = debit
  needsReview?: boolean; // traditional extractor only — never set by the AI path
  reviewReason?: string;
}
```

- [ ] **Step 2: Run the existing AI-extraction tests to confirm nothing broke**

Run: `npm test -- src/lib/bankStatementExtraction.test.ts`
Expected: PASS (the two new fields are optional; `toEqual` treats an absent optional property as equal to a present-but-undefined one, so none of the existing assertions change behavior).

- [ ] **Step 3: Write the failing tests for the traditional extractor**

```ts
// src/lib/traditionalBankStatementExtraction.test.ts
import { describe, expect, it } from "vitest";
import { extractTraditional } from "./traditionalBankStatementExtraction";

describe("extractTraditional", () => {
  it("parses a clean row for both a credit and a debit", () => {
    const text = `Trans. Time Value Date Description Debit(₦) Credit(₦) Balance After(₦) Channel Transaction Reference
07 Aug 2026 01:25:48 07 Aug 2026 OWealth Withdrawal(Transaction Payment) -- 27,000.00 27,000.00 Mobile 260807010201496141065410
07 Aug 2026 01:25:49 07 Aug 2026 Stamp Duty 50.00 -- 0.00 Mobile 260807550101496166618264`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([
      { date: "2026-08-07", description: "OWealth Withdrawal(Transaction Payment)", amount: 27000 },
      { date: "2026-08-07", description: "Stamp Duty", amount: -50 },
    ]);
    expect(result.lowConfidenceReasons).toEqual([]);
  });

  it("joins a description and reference number that wrap across multiple pdf-parse lines", () => {
    const text = `10 Aug 2026 09:06:15 10 Aug 2026
Transfer to OLAYINKA JACOBS | Momo Payment
Service Bank | 8164665220 | Personal Transfer
500.00 -- 0.00 Mobile
1000042608100806211678
36068098`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([
      {
        date: "2026-08-10",
        description: "Transfer to OLAYINKA JACOBS | Momo Payment Service Bank | 8164665220 | Personal Transfer",
        amount: -500,
      },
    ]);
  });

  it("silently dedupes an exact duplicate row (same reference, same sign and amount)", () => {
    const text = `01 Jan 2026 00:00:00 01 Jan 2026 Interest -- 10.00 10.00 Mobile 111111111111
01 Jan 2026 00:00:00 01 Jan 2026 Interest -- 10.00 10.00 Mobile 111111111111`;

    const result = extractTraditional(text);

    expect(result.rows).toEqual([{ date: "2026-01-01", description: "Interest", amount: 10 }]);
    expect(result.lowConfidenceReasons).toEqual([]);
  });

  it("flags both occurrences of a conflicting-sign duplicate reference as needsReview, never guessing", () => {
    const text = `07 Aug 2026 01:25:48 07 Aug 2026 OWealth Withdrawal(Transaction Payment) -- 27,000.00 60,481.63 Mobile 260807010201496141065410
07 Aug 2026 01:25:48 07 Aug 2026 OWealth Withdrawal(Transaction Payment) 27,000.00 -- 60,481.63 Mobile 260807010201496141065410`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].needsReview).toBe(true);
    expect(result.rows[1].needsReview).toBe(true);
    expect(result.rows[0].amount).toBe(27000);
    expect(result.rows[1].amount).toBe(-27000);
    expect(result.rows[0].reviewReason).toContain("260807010201496141065410");
    expect(result.lowConfidenceReasons).toEqual([
      "2 transaction(s) have a conflicting duplicate elsewhere in the statement and need manual review.",
    ]);
  });

  it("flags a declared-count mismatch against the statement's own Credit Count / Debit Count summary", () => {
    const text = `Credit Count
2
Total Credit
₦100.00
Closing Balance
₦0.00
Debit Count
1
Total Debit
₦50.00
Opening Balance
₦0.00
Period: - 01 Jan 2026 31 Jan 2026 Wallet Account
01 Jan 2026 00:00:00 01 Jan 2026 Deposit -- 100.00 100.00 Mobile 111111111111`;

    const result = extractTraditional(text);

    expect(result.rows).toHaveLength(1);
    expect(result.lowConfidenceReasons).toEqual([
      "Extracted row counts don't match this statement's own declared totals (expected 2 credit / 1 debit, got 1 credit / 0 debit) — some rows may be missing or miscounted.",
    ]);
  });

  it("flags zero extracted rows", () => {
    const result = extractTraditional("no transactions here at all");

    expect(result.rows).toEqual([]);
    expect(result.lowConfidenceReasons).toEqual(["No transactions could be parsed from this statement."]);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- src/lib/traditionalBankStatementExtraction.test.ts`
Expected: FAIL — `src/lib/traditionalBankStatementExtraction.ts` does not exist.

- [ ] **Step 5: Implement**

```ts
// src/lib/traditionalBankStatementExtraction.ts
import type { ParsedStatementRow } from "./bankStatementExtraction";

const ANCHOR_RE = /(\d{2}) ([A-Za-z]{3}) (\d{4}) \d{2}:\d{2}:\d{2} (\d{2}) ([A-Za-z]{3}) (\d{4})/g;
const MONEY_RE = /--|\d{1,3}(?:,\d{3})*\.\d{2}/g;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function toIsoDate(day: string, mon: string, year: string): string | null {
  const month = MONTHS[mon];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function parseAmount(token: string): number {
  return Number(token.replace(/,/g, ""));
}

interface RawRow {
  index: number; // absolute offset in the normalized text where this row's anchor starts
  date: string;
  description: string;
  amount: number;
  reference: string;
}

function parseRows(normalized: string): RawRow[] {
  const anchors = [...normalized.matchAll(ANCHOR_RE)];
  const rows: RawRow[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const start = anchor.index;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : normalized.length;
    const chunk = normalized.slice(start, end);
    const anchorLength = anchor[0].length;

    const [, , , , day, mon, year] = anchor; // groups 4-6 are the Value Date, not Trans. Time
    const date = toIsoDate(day, mon, year);
    if (!date) continue;

    const moneyMatches = [...chunk.matchAll(MONEY_RE)];
    if (moneyMatches.length < 3) continue;
    const [debitToken, creditToken, balanceToken] = moneyMatches;

    const debitIsAmount = debitToken[0] !== "--";
    const creditIsAmount = creditToken[0] !== "--";
    if (debitIsAmount === creditIsAmount) continue; // both blank or both filled — malformed, drop rather than guess

    const amount = debitIsAmount ? -parseAmount(debitToken[0]) : parseAmount(creditToken[0]);

    const description = chunk.slice(anchorLength, debitToken.index).replace(/\s+/g, " ").trim();
    if (!description) continue;

    const afterBalance = chunk.slice(balanceToken.index + balanceToken[0].length);
    const mobileMatch = afterBalance.match(/Mobile([\s\S]*)/);
    const reference = mobileMatch ? (mobileMatch[1].match(/\d+/g) ?? []).join("") : "";

    rows.push({ index: start, date, description, amount, reference });
  }

  return rows;
}

function dedupeByReference(rows: RawRow[]): { rows: RawRow[]; flagged: Set<number> } {
  const byRef = new Map<string, RawRow[]>();
  for (const row of rows) {
    if (!row.reference) continue;
    const group = byRef.get(row.reference) ?? [];
    group.push(row);
    byRef.set(row.reference, group);
  }

  const flagged = new Set<number>();
  const toDrop = new Set<number>();

  for (const group of byRef.values()) {
    if (group.length < 2) continue;
    const allSame = group.every((r) => r.amount === group[0].amount);
    if (allSame) {
      for (const dup of group.slice(1)) toDrop.add(dup.index);
    } else {
      for (const row of group) flagged.add(row.index);
    }
  }

  return { rows: rows.filter((r) => !toDrop.has(r.index)), flagged };
}

function checkDeclaredCounts(normalized: string, rows: RawRow[]): string[] {
  const reasons: string[] = [];
  const blockRe = /Credit Count\s+(\d+)[\s\S]*?Debit Count\s+(\d+)/g;
  const blocks = [...normalized.matchAll(blockRe)];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const sectionStart = block.index + block[0].length;
    const sectionEnd = i + 1 < blocks.length ? blocks[i + 1].index : normalized.length;
    const expectedCredit = Number(block[1]);
    const expectedDebit = Number(block[2]);

    const sectionRows = rows.filter((r) => r.index >= sectionStart && r.index < sectionEnd);
    const actualCredit = sectionRows.filter((r) => r.amount > 0).length;
    const actualDebit = sectionRows.filter((r) => r.amount < 0).length;

    if (actualCredit !== expectedCredit || actualDebit !== expectedDebit) {
      reasons.push(
        `Extracted row counts don't match this statement's own declared totals (expected ${expectedCredit} credit / ${expectedDebit} debit, got ${actualCredit} credit / ${actualDebit} debit) — some rows may be missing or miscounted.`
      );
    }
  }

  return reasons;
}

export interface TraditionalExtractionResult {
  rows: ParsedStatementRow[];
  lowConfidenceReasons: string[];
}

export function extractTraditional(statementText: string): TraditionalExtractionResult {
  const normalized = statementText.replace(/\s+/g, " ");
  const rawRows = parseRows(normalized);
  const { rows: dedupedRows, flagged } = dedupeByReference(rawRows);

  const rows: ParsedStatementRow[] = dedupedRows.map((row) =>
    flagged.has(row.index)
      ? {
          date: row.date,
          description: row.description,
          amount: row.amount,
          needsReview: true,
          reviewReason: `Same reference (${row.reference}) appears elsewhere in the statement with a conflicting amount/sign — couldn't determine which is correct.`,
        }
      : { date: row.date, description: row.description, amount: row.amount }
  );

  const lowConfidenceReasons: string[] = [];
  if (rows.length === 0) {
    lowConfidenceReasons.push("No transactions could be parsed from this statement.");
  }
  const needsReviewCount = rows.filter((r) => r.needsReview).length;
  if (needsReviewCount > 0) {
    lowConfidenceReasons.push(
      `${needsReviewCount} transaction(s) have a conflicting duplicate elsewhere in the statement and need manual review.`
    );
  }
  lowConfidenceReasons.push(...checkDeclaredCounts(normalized, dedupedRows));

  return { rows, lowConfidenceReasons };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/lib/traditionalBankStatementExtraction.test.ts`
Expected: PASS — all six cases.

- [ ] **Step 7: Sanity-check against the real sample statement**

This is a manual spot-check, not an automated test (no fixture PDF lives in the repo). If a copy of the real `OLAYINKA ISAIAH JACOBS` statement PDF is available locally, run:

```bash
node -e "
const fs = require('fs');
(async () => {
  const { PDFParse } = await import('pdf-parse');
  const { getPath } = await import('pdf-parse/worker');
  PDFParse.setWorker(getPath());
  const { extractTraditional } = await import('./src/lib/traditionalBankStatementExtraction.ts');
  const buffer = fs.readFileSync('PATH_TO_STATEMENT.pdf');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  const extraction = extractTraditional(result.text);
  console.log('rows:', extraction.rows.length);
  console.log('lowConfidenceReasons:', extraction.lowConfidenceReasons);
  console.log('needsReview rows:', extraction.rows.filter((r) => r.needsReview).length);
})();
" --experimental-strip-types
```

Expected: a non-zero row count, and at least one `needsReview` row (the known OWealth-transfer duplicate) — confirming the never-guess path actually fires on real data, not just the synthetic tests. If this doesn't match, fix the algorithm before moving on — don't proceed to wire this into the app on the strength of synthetic tests alone (this is the gap-tolerant-fill-style differentiator the whole feature exists for).

- [ ] **Step 8: Commit**

```bash
git add src/lib/bankStatementExtraction.ts src/lib/traditionalBankStatementExtraction.ts src/lib/traditionalBankStatementExtraction.test.ts
git commit -m "Add traditional (regex-based) bank statement extraction"
```

---

### Task 2: Settings schema — `bankStatementExtractionMethod`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_bank_statement_extraction_method/migration.sql` (generated, not hand-written)
- Create: `prisma/apply-prod-add-bank-statement-extraction-method-migration.ts`
- Create: `prisma/resolve-prod-add-bank-statement-extraction-method-migration.ts`
- Modify: `package.json` (register the two new `db:*` scripts)

**Interfaces:**
- Produces: `Settings.bankStatementExtractionMethod: string` (values `"ai" | "traditional"`, default `"ai"`) on the generated Prisma Client — consumed by Task 3 and Task 5.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In the `Settings` model, add the new column immediately after `activeReceiptTemplateId`:

```prisma
model Settings {
  id                       String  @id @default(cuid())
  ownerId                  String  @unique
  friendlyReminderDays     Int     @default(3)
  firmReminderDays         Int     @default(15)
  finalNoticeDays          Int     @default(45)
  passwordReconfirmMinutes Int     @default(20)
  sendReceiptImmediately   Boolean   @default(false)
  activeReceiptTemplateId  String    @default("default")
  bankStatementExtractionMethod String @default("ai")
  businessName             String?
  businessType             String?
  logoUrl                  String?
  businessEmail            String?
  businessPhone            String?
  country                  String?
  onboardingCompletedAt    DateTime?

  owner User @relation(fields: [ownerId], references: [id])
}
```

- [ ] **Step 2: Generate the migration WITHOUT applying it**

Run: `npx prisma migrate dev --name add_bank_statement_extraction_method --create-only`

This writes `prisma/migrations/<timestamp>_add_bank_statement_extraction_method/migration.sql` but does not touch the database.

- [ ] **Step 3: STOP — get explicit user approval of the exact SQL before applying anywhere**

Read the generated migration file and show its exact, verbatim contents to the user. Expected contents (Prisma may format whitespace slightly differently, but the statement itself should be this):

```sql
-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "bankStatementExtractionMethod" TEXT NOT NULL DEFAULT 'ai';
```

**Do not proceed to Step 4 until the user has explicitly approved this SQL.** This applies even though the change is additive and matches an already-approved design — per this project's standing rule, migration SQL approval happens at the SQL level, not just the design level, and applies to the dev database too, not only production.

- [ ] **Step 4: Apply the approved migration to dev**

Run: `npm run db:migrate` (with no extra args — it detects and applies the already-generated pending migration from Step 2; requires `DATABASE_URL` pointed at the dev database and `ALLOW_DESTRUCTIVE_DB_SCRIPT=true`, per `prisma/assert-dev-database.ts`).

- [ ] **Step 5: Verify the Prisma Client regenerated**

Run: `npx prisma generate`, then `npx tsc --noEmit` and confirm no type errors.

- [ ] **Step 6: Write the prod-apply script**

Modeled directly on `prisma/apply-prod-active-receipt-template-migration.ts`:

```ts
// prisma/apply-prod-add-bank-statement-extraction-method-migration.ts
// Applies prisma/migrations/<timestamp>_add_bank_statement_extraction_method
// to PRODUCTION. Purely additive: a single ALTER TABLE ADD COLUMN with a
// DEFAULT, backfilling every existing Settings row to 'ai' without touching
// any other column or row.
//
// Safety, in order:
//   1. assertProductionDatabase — positive host match + CONFIRM_PRODUCTION_MIGRATION=true
//   2. idempotency check — abort if "Settings"."bankStatementExtractionMethod"
//      already exists, or a matching row is already recorded as finished
//      in _prisma_migrations
//   3. read-only baseline row counts across every existing table, printed
//      before anything is written
//   4. the migration SQL is read verbatim from the migration file and
//      executed inside a single transaction — never hand-copied
//   5. baseline re-captured after commit and diffed against the
//      pre-migration counts; every table's row count must be unchanged

import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/apply-prod-add-bank-statement-extraction-method-migration.ts");

const MIGRATIONS_DIR = join(__dirname, "migrations");
const MIGRATION_DIR_NAME = readdirSync(MIGRATIONS_DIR).find((name) =>
  name.endsWith("_add_bank_statement_extraction_method")
);
if (!MIGRATION_DIR_NAME) {
  throw new Error(
    "Could not find a migrations/<timestamp>_add_bank_statement_extraction_method directory — run `npm run db:migrate` first."
  );
}
const MIGRATION_FILE = join(MIGRATIONS_DIR, MIGRATION_DIR_NAME, "migration.sql");

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
  "Payment",
  "BankStatementUpload",
  "BankTransaction",
];

async function captureBaseline(client: Client): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of EXISTING_TABLES) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

async function columnExists(client: Client, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tableName, columnName]
  );
  return (result.rowCount ?? 0) > 0;
}

async function tableExists(client: Client, tableName: string): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return (result.rowCount ?? 0) > 0;
}

async function alreadyRecordedInMigrationHistory(client: Client): Promise<boolean> {
  if (!(await tableExists(client, "_prisma_migrations"))) return false;
  const result = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name ILIKE '%add_bank_statement_extraction_method%' AND finished_at IS NOT NULL`
  );
  return (result.rowCount ?? 0) > 0;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log(`Connected to ${new URL(process.env.DATABASE_URL!).hostname}`);

    if (await columnExists(client, "Settings", "bankStatementExtractionMethod")) {
      console.log('"Settings"."bankStatementExtractionMethod" already exists in production — nothing to do. Aborting.');
      return;
    }
    if (await alreadyRecordedInMigrationHistory(client)) {
      console.log("A matching migration is already recorded as finished in _prisma_migrations — aborting.");
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
      console.log("\nAll table row counts unchanged (as expected for a column addition).");
    }

    const defaultCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM "Settings" WHERE "bankStatementExtractionMethod" = 'ai'`
    );
    const totalSettings = after["Settings"];
    console.log(
      `"bankStatementExtractionMethod" now exists; ${defaultCount.rows[0].count} of ${totalSettings} Settings row(s) backfilled to 'ai' (expected: all of them).`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 7: Write the prod-resolve script**

Modeled directly on `prisma/resolve-prod-active-receipt-template-migration.ts`:

```ts
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
```

- [ ] **Step 8: Register the npm scripts**

In `package.json`, add alongside the other `db:apply-prod-*`/`db:resolve-prod-*` entries:

```json
"db:apply-prod-add-bank-statement-extraction-method-migration": "tsx prisma/apply-prod-add-bank-statement-extraction-method-migration.ts",
"db:resolve-prod-add-bank-statement-extraction-method-migration": "tsx prisma/resolve-prod-add-bank-statement-extraction-method-migration.ts",
```

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/apply-prod-add-bank-statement-extraction-method-migration.ts prisma/resolve-prod-add-bank-statement-extraction-method-migration.ts package.json
git commit -m "Add Settings.bankStatementExtractionMethod column"
```

---

### Task 3: Settings application-layer wiring

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/mappers.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/settings/route.ts`

**Interfaces:**
- Consumes: `Settings.bankStatementExtractionMethod` (Task 2).
- Produces: `AppSettings.bankStatementExtractionMethod: string`, validated `PUT /api/settings` support for the field — consumed by Task 4.

- [ ] **Step 1: `src/lib/settings.ts` — default new owners to `"ai"`**

Change:

```ts
export async function getOrCreateSettings(ownerId: string) {
  const existing = await prisma.settings.findUnique({ where: { ownerId } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      ownerId,
      friendlyReminderDays: 3,
      firmReminderDays: 15,
      finalNoticeDays: 45,
      passwordReconfirmMinutes: PASSWORD_RECONFIRM_DEFAULT_MINUTES,
      sendReceiptImmediately: false,
      activeReceiptTemplateId: "default",
    },
  });
}
```

to:

```ts
export async function getOrCreateSettings(ownerId: string) {
  const existing = await prisma.settings.findUnique({ where: { ownerId } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      ownerId,
      friendlyReminderDays: 3,
      firmReminderDays: 15,
      finalNoticeDays: 45,
      passwordReconfirmMinutes: PASSWORD_RECONFIRM_DEFAULT_MINUTES,
      sendReceiptImmediately: false,
      activeReceiptTemplateId: "default",
      bankStatementExtractionMethod: "ai",
    },
  });
}
```

- [ ] **Step 2: `src/lib/types.ts` — add the field to `AppSettings`**

Change:

```ts
export interface AppSettings extends ReminderSchedule {
  passwordReconfirmMinutes: number;
  sendReceiptImmediately: boolean;
  activeReceiptTemplateId: string;
  businessName: string | null;
```

to:

```ts
export interface AppSettings extends ReminderSchedule {
  passwordReconfirmMinutes: number;
  sendReceiptImmediately: boolean;
  activeReceiptTemplateId: string;
  bankStatementExtractionMethod: string;
  businessName: string | null;
```

- [ ] **Step 3: `src/lib/mappers.ts` — thread the field through `mapSettings`**

Change the `SettingsRow` type:

```ts
type SettingsRow = {
  friendlyReminderDays: number;
  firmReminderDays: number;
  finalNoticeDays: number;
  passwordReconfirmMinutes: number;
  sendReceiptImmediately: boolean;
  activeReceiptTemplateId: string;
  businessName: string | null;
  businessType: string | null;
  logoUrl: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  country: string | null;
};
```

to:

```ts
type SettingsRow = {
  friendlyReminderDays: number;
  firmReminderDays: number;
  finalNoticeDays: number;
  passwordReconfirmMinutes: number;
  sendReceiptImmediately: boolean;
  activeReceiptTemplateId: string;
  bankStatementExtractionMethod: string;
  businessName: string | null;
  businessType: string | null;
  logoUrl: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  country: string | null;
};
```

And `mapSettings`:

```ts
export function mapSettings(s: SettingsRow): AppSettings {
  return {
    friendlyDays: s.friendlyReminderDays,
    firmDays: s.firmReminderDays,
    finalDays: s.finalNoticeDays,
    passwordReconfirmMinutes: s.passwordReconfirmMinutes,
    sendReceiptImmediately: s.sendReceiptImmediately,
    activeReceiptTemplateId: s.activeReceiptTemplateId,
    bankStatementExtractionMethod: s.bankStatementExtractionMethod,
    businessName: s.businessName,
    businessType: s.businessType,
    logoUrl: s.logoUrl,
    businessEmail: s.businessEmail,
    businessPhone: s.businessPhone,
    country: s.country,
  };
}
```

- [ ] **Step 4: `src/app/api/settings/route.ts` — validate and persist the field on PUT**

`body` here is untyped (`const body = await request.json();`, no interface) — only the `data` object's inline type needs the new field. Change:

```ts
  const data: {
    friendlyReminderDays?: number;
    firmReminderDays?: number;
    finalNoticeDays?: number;
    passwordReconfirmMinutes?: number;
    sendReceiptImmediately?: boolean;
    activeReceiptTemplateId?: string;
    businessName?: string | null;
    businessType?: string | null;
    logoUrl?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    country?: string | null;
    onboardingCompletedAt?: Date;
  } = {};
```

to:

```ts
  const data: {
    friendlyReminderDays?: number;
    firmReminderDays?: number;
    finalNoticeDays?: number;
    passwordReconfirmMinutes?: number;
    sendReceiptImmediately?: boolean;
    activeReceiptTemplateId?: string;
    bankStatementExtractionMethod?: string;
    businessName?: string | null;
    businessType?: string | null;
    logoUrl?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    country?: string | null;
    onboardingCompletedAt?: Date;
  } = {};
```

Then, following the existing `activeReceiptTemplateId` validation block exactly, add this new block immediately after it (and before the `businessName` block):

```ts
  if (body.bankStatementExtractionMethod !== undefined) {
    const bankStatementExtractionMethod = String(body.bankStatementExtractionMethod);
    if (!["ai", "traditional"].includes(bankStatementExtractionMethod)) {
      return NextResponse.json(
        { error: "bankStatementExtractionMethod must be 'ai' or 'traditional'" },
        { status: 400 }
      );
    }
    data.bankStatementExtractionMethod = bankStatementExtractionMethod;
  }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.ts src/lib/types.ts src/lib/mappers.ts src/app/api/settings/route.ts
git commit -m "Thread bankStatementExtractionMethod through Settings API layer"
```

---

### Task 4: Settings UI

**Files:**
- Modify: `src/context/AppDataContext.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `AppSettings.bankStatementExtractionMethod` (Task 3).
- Produces: `useAppData().bankStatementExtractionMethod: string`, `useAppData().updateBankStatementExtractionMethod(method: string): Promise<void>` — consumed by Task 6 (upload UI).

- [ ] **Step 1: `AppDataContext.tsx` — add state**

After the existing `const [activeReceiptTemplateId, setActiveReceiptTemplateId] = useState<string>("default");` line, add:

```ts
  const [bankStatementExtractionMethod, setBankStatementExtractionMethod] = useState<string>("ai");
```

- [ ] **Step 2: Set it from the initial settings load**

After the existing `setActiveReceiptTemplateId(settingsRes.activeReceiptTemplateId);` line inside the `load()` effect, add:

```ts
        setBankStatementExtractionMethod(settingsRes.bankStatementExtractionMethod);
```

- [ ] **Step 3: Add the updater**

After the existing `updateActiveReceiptTemplate` callback, add:

```ts
  const updateBankStatementExtractionMethod = useCallback(async (method: string) => {
    const updated = await fetchJson<AppSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ bankStatementExtractionMethod: method }),
    });
    setBankStatementExtractionMethod(updated.bankStatementExtractionMethod);
  }, []);
```

- [ ] **Step 4: Expose it on the context interface**

In the `AppDataContextValue` interface, after `activeReceiptTemplateId: string;`, add:

```ts
  bankStatementExtractionMethod: string;
```

and after `updateActiveReceiptTemplate: (templateId: string) => Promise<void>;`, add:

```ts
  updateBankStatementExtractionMethod: (method: string) => Promise<void>;
```

- [ ] **Step 5: Wire it into the `value` object and its `useMemo` deps**

In the `value` object (after `activeReceiptTemplateId,`), add `bankStatementExtractionMethod,`; after `updateActiveReceiptTemplate,`, add `updateBankStatementExtractionMethod,`. Do the same in the `useMemo` dependency array immediately below it (same two insertion points) — both the object and its deps array must list the same fields, or the memoized value will go stale.

- [ ] **Step 6: Settings page — add the extraction-method card**

In `src/app/(app)/settings/page.tsx`, add `bankStatementExtractionMethod` and `updateBankStatementExtractionMethod` to the `useAppData()` destructure at the top of `SettingsPage`, add a `savingExtractionMethod` state next to `savingReceiptSetting`, add a handler next to `handleSetSendReceiptImmediately`:

```ts
  const [savingExtractionMethod, setSavingExtractionMethod] = useState(false);

  async function handleSetExtractionMethod(method: "ai" | "traditional") {
    if (method === bankStatementExtractionMethod || savingExtractionMethod) return;
    setSavingExtractionMethod(true);
    try {
      await updateBankStatementExtractionMethod(method);
      showToast(
        method === "traditional"
          ? "Bank statements will now be parsed with the traditional (non-AI) method"
          : "Bank statements will now be parsed with AI"
      );
    } catch {
      showToast("Failed to save — see console for details");
    } finally {
      setSavingExtractionMethod(false);
    }
  }
```

Then add a new `Card`, placed immediately after the existing "Payment receipts" `Card` and before "Reminder schedule":

```tsx
      <Card>
        <CardHeader
          title="Bank statement extraction"
          subtitle="How uploaded bank statements are parsed into transactions"
        />
        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => handleSetExtractionMethod("ai")}
              disabled={savingExtractionMethod}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                bankStatementExtractionMethod === "ai"
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="text-sm font-medium text-slate-900">AI-powered (recommended)</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Uses Claude to read and structure your statement. Handles unusual formats and
                layout variations.
              </p>
            </button>
            <button
              onClick={() => handleSetExtractionMethod("traditional")}
              disabled={savingExtractionMethod}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                bankStatementExtractionMethod === "traditional"
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <p className="text-sm font-medium text-slate-900">Traditional (faster, no AI cost, less reliable)</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Uses pattern matching instead of AI. Faster and free, but may misread unusual
                formats or ambiguous transactions.
              </p>
            </button>
          </div>
        </div>
      </Card>
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run `npm run dev`, open Settings, confirm the new "Bank statement extraction" card renders between "Payment receipts" and "Reminder schedule", click "Traditional" and confirm the toast + persisted selection (reload the page — it should stay selected), then switch back to "AI-powered".

- [ ] **Step 9: Commit**

```bash
git add src/context/AppDataContext.tsx "src/app/(app)/settings/page.tsx"
git commit -m "Add Settings UI for bank statement extraction method"
```

---

### Task 5: Upload route — extraction routing

**Files:**
- Modify: `src/app/api/bank-statements/route.ts`

**Interfaces:**
- Consumes: `getOrCreateSettings` (`src/lib/settings.ts`), `extractTraditional` (Task 1), `extractTransactionsFromStatementText`/`StatementExtractionError` (existing).
- Produces: `POST /api/bank-statements` response shape `{ upload, rows, lowConfidenceReasons: string[] }`, and an optional request-body `forceMethod: "ai"` override for a single upload — consumed by Task 6.

- [ ] **Step 1: Add imports and the body type**

Add to the imports:

```ts
import { getOrCreateSettings } from "@/lib/settings";
import { extractTraditional } from "@/lib/traditionalBankStatementExtraction";
```

Change `CreateBody`:

```ts
interface CreateBody {
  fileUrl?: unknown;
  fileName?: unknown;
  forceMethod?: unknown;
}
```

- [ ] **Step 2: Determine the extraction method right after the auth check**

After the existing `const { fileUrl, fileName } = body;` line, add:

```ts
  const settings = await getOrCreateSettings(session.user.id);
  const method = body.forceMethod === "ai" ? "ai" : settings.bankStatementExtractionMethod;
```

- [ ] **Step 3: Replace the extraction block to branch on `method`**

Change:

```ts
  let rows;
  try {
    rows = await extractTransactionsFromStatementText(extractedText);
  } catch (error) {
    console.error("Bank statement transaction extraction failed", error);
    if (error instanceof StatementExtractionError) {
      return fail(error.message);
    }
    return fail("Couldn't parse this statement — please try again.");
  }

  const reviewed = await prisma.bankStatementUpload.update({
    where: { id: upload.id },
    // ParsedStatementRow[] is a plain-data array but doesn't structurally
    // satisfy Prisma's InputJsonValue (which requires an index signature) —
    // this cast is just telling Prisma's Json column type that the array is
    // JSON-serializable, not changing what's actually stored.
    data: { status: "needs_review", parsedRowsJson: rows as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ upload: mapBankStatementUpload(reviewed), rows });
```

to:

```ts
  let rows;
  let lowConfidenceReasons: string[] = [];
  if (method === "traditional") {
    const result = extractTraditional(extractedText);
    rows = result.rows;
    lowConfidenceReasons = result.lowConfidenceReasons;
  } else {
    try {
      rows = await extractTransactionsFromStatementText(extractedText);
    } catch (error) {
      console.error("Bank statement transaction extraction failed", error);
      if (error instanceof StatementExtractionError) {
        return fail(error.message);
      }
      return fail("Couldn't parse this statement — please try again.");
    }
  }

  const reviewed = await prisma.bankStatementUpload.update({
    where: { id: upload.id },
    // ParsedStatementRow[] is a plain-data array but doesn't structurally
    // satisfy Prisma's InputJsonValue (which requires an index signature) —
    // this cast is just telling Prisma's Json column type that the array is
    // JSON-serializable, not changing what's actually stored.
    data: { status: "needs_review", parsedRowsJson: rows as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ upload: mapBankStatementUpload(reviewed), rows, lowConfidenceReasons });
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

With the dev server running and a Settings owner set to `"traditional"`:
1. Upload the real (or a synthetic) OWealth/GTBank-format statement. Confirm the response includes non-empty `rows` and a `lowConfidenceReasons` array (check the Network tab or add a temporary `console.log` and remove it before committing).
2. Switch the owner's setting back to `"ai"` and re-upload the same file — confirm `rows` come back from the unchanged Claude path (existing behavior) and `lowConfidenceReasons` is `[]`.
3. With the setting on `"traditional"`, POST directly to `/api/bank-statements` with `forceMethod: "ai"` in the body (e.g. via a temporary curl/fetch) and confirm it uses the AI path for that one request without changing the persisted setting.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/bank-statements/route.ts
git commit -m "Route bank statement extraction through Settings.bankStatementExtractionMethod"
```

---

### Task 6: Upload UI — warning banner and low-confidence retry

**Files:**
- Modify: `src/app/(app)/reconciliation/UploadStatementButton.tsx`

**Interfaces:**
- Consumes: `useAppData().bankStatementExtractionMethod` (Task 4), `POST /api/bank-statements` response shape (Task 5).

- [ ] **Step 1: Replace the file with the extended version**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { useToast } from "@/context/ToastContext";
import { useAppData } from "@/context/AppDataContext";
import { Spinner } from "@/components/ui/Spinner";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;
// POST /api/bank-statements is one opaque request (download, parse, then
// either a pattern-match or a Claude call) with no server-sent progress,
// so this is a time-based guess at when parsing gives way to extraction,
// not a real signal.
const ANALYZING_LABEL_DELAY_MS = 2000;

interface PendingLowConfidence {
  uploadId: string;
  fileUrl: string;
  fileName: string;
  reasons: string[];
}

export function UploadStatementButton() {
  const router = useRouter();
  const { showToast, showProgressToast, updateProgressToast, dismissToast } = useToast();
  const { bankStatementExtractionMethod } = useAppData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingLowConfidence, setPendingLowConfidence] = useState<PendingLowConfidence | null>(null);

  async function submitStatement(fileUrl: string, fileName: string, forceMethod?: "ai") {
    const response = await fetch("/api/bank-statements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl, fileName, ...(forceMethod ? { forceMethod } : {}) }),
    });
    return response.json();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      showToast("Please upload a PDF file.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      showToast("File must be smaller than 15MB.");
      return;
    }

    setPendingLowConfidence(null);
    setUploading(true);
    const progressToastId = showProgressToast("Uploading…");
    let analyzingLabelTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const blob = await upload(`bank-statements/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/bank-statement",
        onUploadProgress: (event) => {
          updateProgressToast(progressToastId, `Uploading… ${Math.round(event.percentage)}%`);
        },
      });

      updateProgressToast(progressToastId, "Reading PDF…");
      analyzingLabelTimer = setTimeout(() => {
        updateProgressToast(
          progressToastId,
          bankStatementExtractionMethod === "traditional"
            ? "Parsing transactions…"
            : "Analyzing transactions with AI…"
        );
      }, ANALYZING_LABEL_DELAY_MS);

      const data = await submitStatement(blob.url, file.name);
      if (data.upload.status === "failed") {
        showToast(data.upload.errorMessage ?? "Couldn't process this statement.");
        return;
      }
      if (data.lowConfidenceReasons?.length > 0) {
        setPendingLowConfidence({
          uploadId: data.upload.id,
          fileUrl: blob.url,
          fileName: file.name,
          reasons: data.lowConfidenceReasons,
        });
        return;
      }
      router.push(`/reconciliation/${data.upload.id}/review`);
    } catch {
      showToast("Upload failed — try again.");
    } finally {
      clearTimeout(analyzingLabelTimer);
      dismissToast(progressToastId);
      setUploading(false);
    }
  }

  async function handleRetryWithAi() {
    if (!pendingLowConfidence) return;
    const { fileUrl, fileName } = pendingLowConfidence;
    setUploading(true);
    const progressToastId = showProgressToast("Analyzing transactions with AI…");
    try {
      const data = await submitStatement(fileUrl, fileName, "ai");
      if (data.upload.status === "failed") {
        showToast(data.upload.errorMessage ?? "Couldn't process this statement.");
        return;
      }
      setPendingLowConfidence(null);
      router.push(`/reconciliation/${data.upload.id}/review`);
    } catch {
      showToast("Retry failed — try again.");
    } finally {
      dismissToast(progressToastId);
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {bankStatementExtractionMethod === "traditional" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Using traditional extraction. This method may misread transactions, especially with
          unusual formats or ambiguous data — please review the parsed results carefully before
          confirming.
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {uploading && <Spinner className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Upload bank statement"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {pendingLowConfidence && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">This parse looks unreliable:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {pendingLowConfidence.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleRetryWithAi}
              disabled={uploading}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
            >
              Retry with AI extraction
            </button>
            <button
              type="button"
              onClick={() => {
                router.push(`/reconciliation/${pendingLowConfidence.uploadId}/review`);
                setPendingLowConfidence(null);
              }}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Continue to review anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With the dev server running:
1. Settings on `"ai"`: confirm no warning banner appears above the upload button, and upload still works exactly as before.
2. Settings on `"traditional"`: confirm the persistent amber banner appears above the upload button.
3. Upload a statement that produces `lowConfidenceReasons` (e.g. the real OWealth-format statement, which should trip the needs-review-duplicate reason): confirm the inline "This parse looks unreliable" panel appears with the reasons listed, and that "Retry with AI extraction" re-runs the upload via the AI path and navigates to a (new) review page, while "Continue to review anyway" navigates to the original upload's review page.
4. Upload a clean statement that produces no low-confidence reasons: confirm it navigates straight to the review page as before, with no intermediate panel.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/reconciliation/UploadStatementButton.tsx"
git commit -m "Add traditional-extraction warning banner and low-confidence retry UI"
```

---

### Task 7: Review UI — needs-review badge

**Files:**
- Modify: `src/app/(app)/reconciliation/[uploadId]/review/page.tsx`
- Modify: `src/app/(app)/reconciliation/[uploadId]/review/ReviewRowsEditor.tsx`

**Interfaces:**
- Consumes: `ParsedStatementRow.needsReview`/`reviewReason` as persisted in `BankStatementUpload.parsedRowsJson` (Task 1, Task 5).

- [ ] **Step 1: `page.tsx` — widen the `initialRows` cast**

Change:

```ts
  const initialRows = Array.isArray(upload.parsedRowsJson)
    ? (upload.parsedRowsJson as { date: string; description: string; amount: number }[])
    : [];
```

to:

```ts
  const initialRows = Array.isArray(upload.parsedRowsJson)
    ? (upload.parsedRowsJson as {
        date: string;
        description: string;
        amount: number;
        needsReview?: boolean;
        reviewReason?: string;
      }[])
    : [];
```

- [ ] **Step 2: `ReviewRowsEditor.tsx` — extend the local `Row` type and render the badge**

Add the `Badge` import:

```ts
import { Badge } from "@/components/ui/Badge";
```

Change the local `Row` interface:

```ts
interface Row {
  date: string;
  description: string;
  amount: number;
}
```

to:

```ts
interface Row {
  date: string;
  description: string;
  amount: number;
  needsReview?: boolean;
  reviewReason?: string;
}
```

In the table body, change the description `<td>`:

```tsx
                    <td className="px-5 py-2.5">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRow(index, "description", e.target.value)}
                        className="input"
                      />
                    </td>
```

to:

```tsx
                    <td className="px-5 py-2.5">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRow(index, "description", e.target.value)}
                        className="input"
                      />
                      {row.needsReview && (
                        <div className="mt-1.5 flex items-start gap-1.5">
                          <Badge variant="warning">Needs review</Badge>
                          <span className="text-xs text-amber-700">{row.reviewReason}</span>
                        </div>
                      )}
                    </td>
```

(`needsReview`/`reviewReason` ride along unused in `updateRow`/`addRow`/`deleteRow` — those only ever touch `date`/`description`/`amount` by field name, so the extra optional fields pass through untouched, and a manually-added row via "+ Add row" simply lacks them, correctly showing no badge.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Upload a statement (with `"traditional"` selected) that produces at least one `needsReview` row, open its review page, and confirm the flagged row shows the "Needs review" badge and reason text, while unflagged rows don't. Confirm editing and deleting a flagged row still works normally, and that confirming the review (PATCH) succeeds — the flag doesn't block confirmation, it's advisory only.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/reconciliation/[uploadId]/review/page.tsx" "src/app/(app)/reconciliation/[uploadId]/review/ReviewRowsEditor.tsx"
git commit -m "Show needs-review badge for ambiguous traditional-extraction rows"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — every existing test plus the new `traditionalBankStatementExtraction.test.ts` cases.

- [ ] **Step 2: Full typecheck and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: End-to-end manual walkthrough**

With the dev server running: set Settings to `"traditional"`, upload the real statement, confirm the warning banner, the low-confidence panel (if triggered), the needs-review badges on the review page, and a successful confirm into `BankTransaction` rows via Prisma Studio. Then switch back to `"ai"` and confirm the original AI-path flow is completely unaffected end to end.
