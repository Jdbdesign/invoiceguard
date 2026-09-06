# Bank Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload a bank statement PDF, review its parsed transactions, and match them against recorded invoice payments in three buckets (Matched / Unmatched-ours / Unmatched-bank).

**Architecture:** A new `Payment` model becomes the single source of truth for "money the app believes was received," populated by the three existing payment-recording routes. A new PDF pipeline (`pdf-parse` for text extraction → Claude for structuring inconsistent bank layouts into rows) turns an uploaded statement into reviewable rows, which the user confirms into `BankTransaction` records. A pure, unit-tested matching function compares unreconciled `Payment`s against unmatched `BankTransaction`s (exact amount, ±3 day window) to produce the four-bucket view.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 (driver adapter, PostgreSQL), TypeScript, `@anthropic-ai/sdk` (already present), `@vercel/blob` (already present), new: `pdf-parse`, `vitest` (test runner — none exists in this repo today, see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-09-06-bank-reconciliation-design.md`

## Global Constraints

- No test framework exists in this codebase today (confirmed: no `vitest`/`jest` dependency, no `test` script, zero `*.test.ts` files). This plan introduces `vitest`, scoped to **pure-logic unit tests only** (mappers, PDF validation heuristics, the Claude-response parser, the matching algorithm). API routes have no existing test-DB harness anywhere in this codebase and are verified manually via the dev server, consistent with how every existing route in this app is verified today. Do not invent a route-testing harness beyond this plan's scope.
- IDs: `cuid()`. No `updatedAt` field on any model. No soft-delete. `status` fields are plain `String`, never a Prisma `enum`. Money is `Float`. (All copied verbatim from `prisma/schema.prisma`'s existing conventions.)
- User-owned top-level resources carry `ownerId: String` referencing `User.id` directly (no `Organization`/`Account` layer exists) — matches `Client`, `Settings`, `ShareLink`.
- Date-only values round-trip through `toIsoDate`/`fromIsoDate` in `src/lib/dateSerialization.ts` (UTC midnight). `BankTransaction.date` and `Payment.paidDate` are both date-only, consistent with the ±3-day matching window being day-granular, not time-granular.
- OCR/scanned-PDF support is explicitly out of scope. A statement with no extractable text layer is rejected with a clear user-facing message, not silently degraded.
- No split/partial matching, no fuzzy amount tolerance beyond a 0.01 float-rounding epsilon, no use of transaction description text in match scoring. These are deliberate v1 simplifications from the spec, not omissions to fix during implementation.
- Match confirmation is a money-moving action (like `mark-paid`) and must call `requireFreshPasswordConfirmation`, per this codebase's existing convention (every route that marks a balance/payment settled gates on it; plain reads and non-money metadata changes like "ignore" do not).
- Package manager is npm. Hosting is Vercel — any new env vars needed locally must be documented the same way `BLOB_READ_WRITE_TOKEN` was documented in the prior onboarding spec.

---

### Task 1: Test runner setup (vitest)

**Files:**
- Modify: `package.json` (add `vitest` devDependency, add `"test": "vitest run"` script)
- Create: `vitest.config.ts`
- Create: `src/lib/dateSerialization.test.ts`

**Interfaces:**
- Consumes: `toIsoDate`, `fromIsoDate` from `src/lib/dateSerialization.ts` (existing, verified verbatim: `toIsoDate(date: Date): string`, `fromIsoDate(iso: string): Date`).
- Produces: a working `npm test` command every later task's unit tests rely on.

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Create the vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add the test script**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run",
```

- [ ] **Step 4: Write the failing test**

This both proves the vitest wiring works and adds real regression coverage for existing, currently-untested date logic that the whole reconciliation feature depends on.

```ts
// src/lib/dateSerialization.test.ts
import { describe, expect, it } from "vitest";
import { fromIsoDate, toIsoDate } from "./dateSerialization";

describe("toIsoDate / fromIsoDate", () => {
  it("round-trips a date through both directions", () => {
    const iso = "2026-03-14";
    expect(toIsoDate(fromIsoDate(iso))).toBe(iso);
  });

  it("stores at UTC midnight regardless of local time zone offset", () => {
    const date = fromIsoDate("2026-01-01");
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
  });

  it("pads single-digit months and days", () => {
    const date = new Date(Date.UTC(2026, 0, 5)); // Jan 5
    expect(toIsoDate(date)).toBe("2026-01-05");
  });
});
```

- [ ] **Step 5: Run it and verify it fails first (sanity check the harness), then passes**

Run: `npm test`
Expected: all three tests PASS immediately (the functions already exist and work) — this step exists to confirm vitest itself is wired correctly, not to drive new implementation. If any test fails, fix the vitest config before proceeding — nothing downstream can be trusted otherwise.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/dateSerialization.test.ts
git commit -m "Add vitest test runner, with coverage for date serialization helpers"
```

---

### Task 2: Prisma schema — Payment, BankStatementUpload, BankTransaction

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_bank_reconciliation/migration.sql` (generated, not hand-written — see Step 2)
- Create: `prisma/apply-prod-add-bank-reconciliation-migration.ts`

**Interfaces:**
- Produces: `prisma.payment`, `prisma.bankStatementUpload`, `prisma.bankTransaction` Prisma Client models, used by every later task.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add `payments Payment[]` to the existing `Invoice` model (inside its relations block, alongside `activityLogs`/`paymentPlan`/`items`):

```prisma
  invoiceItems... // (unchanged fields above)
  client       Client        @relation(fields: [clientId], references: [id])
  activityLogs ActivityLog[]
  paymentPlan  PaymentPlan?
  items        InvoiceItem[]
  payments     Payment[]
```

Add `payments Payment[]` to the existing `Installment` model:

```prisma
model Installment {
  id                String    @id @default(cuid())
  paymentPlanId     String
  installmentNumber Int
  amount            Float
  dueDate           DateTime
  paidDate          DateTime?
  status            String    @default("pending")
  label             String?

  paymentPlan PaymentPlan @relation(fields: [paymentPlanId], references: [id])
  payments    Payment[]
}
```

Add `bankStatementUploads BankStatementUpload[]` and `bankTransactions BankTransaction[]` to the existing `User` model:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  clients              Client[]
  settings             Settings?
  passwordResetTokens  PasswordResetToken[]
  shareLinks           ShareLink[]
  bankStatementUploads BankStatementUpload[]
  bankTransactions     BankTransaction[]
}
```

Append these three new models at the end of the file (after the existing `Settings` model):

```prisma
model Payment {
  id                String    @id @default(cuid())
  invoiceId         String
  installmentId     String?
  amount            Float
  paidDate          DateTime
  createdAt         DateTime  @default(now())
  reconciledAt      DateTime?
  bankTransactionId String?   @unique

  invoice         Invoice          @relation(fields: [invoiceId], references: [id])
  installment     Installment?     @relation(fields: [installmentId], references: [id])
  bankTransaction BankTransaction? @relation(fields: [bankTransactionId], references: [id])

  @@index([invoiceId])
}

model BankStatementUpload {
  id             String    @id @default(cuid())
  ownerId        String
  fileUrl        String
  fileName       String
  status         String    @default("uploaded")
  errorMessage   String?
  parsedRowsJson Json?
  createdAt      DateTime  @default(now())
  reviewedAt     DateTime?

  owner        User              @relation(fields: [ownerId], references: [id])
  transactions BankTransaction[]

  @@index([ownerId, createdAt])
}

model BankTransaction {
  id          String    @id @default(cuid())
  uploadId    String
  ownerId     String
  date        DateTime
  description String
  amount      Float
  position    Int
  ignoredAt   DateTime?
  createdAt   DateTime  @default(now())

  upload  BankStatementUpload @relation(fields: [uploadId], references: [id])
  owner   User                @relation(fields: [ownerId], references: [id])
  payment Payment?

  @@index([ownerId, date])
  @@index([uploadId, position])
}
```

`status` values used by `BankStatementUpload`: `"uploaded"`, `"parsing"`, `"needs_review"`, `"failed"`, `"reviewed"` (matches the spec's pipeline states).

- [ ] **Step 2: Generate the migration**

Run: `npm run db:migrate` (this wraps `prisma migrate dev` via `prisma/guard-migrate-dev.ts`). When prompted for a migration name, enter `add_bank_reconciliation`.

This creates `prisma/migrations/<timestamp>_add_bank_reconciliation/migration.sql`. Open it and verify it contains, at minimum:
- `CREATE TABLE` for `Payment`, `BankStatementUpload`, `BankTransaction` with every column listed above.
- A unique index on `Payment.bankTransactionId`.
- Indexes on `Payment.invoiceId`, `BankStatementUpload(ownerId, createdAt)`, `BankTransaction(ownerId, date)`, `BankTransaction(uploadId, position)`.
- Foreign keys: `Payment → Invoice`, `Payment → Installment`, `Payment → BankTransaction`, `BankStatementUpload → User`, `BankTransaction → BankStatementUpload`, `BankTransaction → User`.

(Exact constraint names are Prisma-generated and will differ run to run — verify columns/tables/indexes/FKs, not exact names.)

- [ ] **Step 3: Verify the Prisma Client regenerated**

Run: `npx prisma generate` (also runs automatically via the `postinstall` script, but run it explicitly here to confirm). Then run `npx tsc --noEmit` and confirm no type errors — this proves `prisma.payment`, `prisma.bankStatementUpload`, `prisma.bankTransaction` now exist on the generated client.

- [ ] **Step 4: Write the prod-apply script**

Modeled directly on `prisma/apply-prod-active-receipt-template-migration.ts`, adjusted for a new-tables migration (idempotency via `tableExists`, not `columnExists`) and the expanded table list:

```ts
// prisma/apply-prod-add-bank-reconciliation-migration.ts
// Applies prisma/migrations/<timestamp>_add_bank_reconciliation to PRODUCTION.
// Purely additive: three new tables (Payment, BankStatementUpload,
// BankTransaction), no changes to any existing table's columns or rows.
//
// Safety, in order:
//   1. assertProductionDatabase — positive host match + CONFIRM_PRODUCTION_MIGRATION=true
//   2. idempotency check — abort if "Payment" already exists, or a matching
//      migration is already recorded as finished in _prisma_migrations
//   3. read-only baseline row counts across every existing table, printed
//      before anything is written
//   4. the migration SQL is read verbatim from the migration file and
//      executed inside a single transaction — never hand-copied
//   5. baseline re-captured after commit and diffed against the
//      pre-migration counts; every existing table's row count must be
//      unchanged, and all three new tables must exist and be empty

import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { assertProductionDatabase } from "./assert-production-database";

assertProductionDatabase("prisma/apply-prod-add-bank-reconciliation-migration.ts");

const MIGRATIONS_DIR = join(__dirname, "migrations");
const MIGRATION_DIR_NAME = readdirSync(MIGRATIONS_DIR).find((name) =>
  name.endsWith("_add_bank_reconciliation")
);
if (!MIGRATION_DIR_NAME) {
  throw new Error(
    "Could not find a migrations/<timestamp>_add_bank_reconciliation directory — run `npm run db:migrate` first."
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
];
const NEW_TABLES = ["Payment", "BankStatementUpload", "BankTransaction"];

async function captureBaseline(client: Client): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of EXISTING_TABLES) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    counts[table] = result.rows[0].count;
  }
  return counts;
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
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name ILIKE '%add_bank_reconciliation%' AND finished_at IS NOT NULL`
  );
  return (result.rowCount ?? 0) > 0;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log(`Connected to ${new URL(process.env.DATABASE_URL!).hostname}`);

    if (await tableExists(client, "Payment")) {
      console.log('"Payment" already exists in production — nothing to do. Aborting.');
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
      console.error(`\nUNEXPECTED: row count changed on existing table(s): ${unexpectedChanges.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll existing table row counts unchanged (as expected — this migration only adds tables).");
    }

    for (const table of NEW_TABLES) {
      const exists = await tableExists(client, table);
      const count = exists
        ? (await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows[0].count
        : null;
      console.log(`"${table}" exists: ${exists}, row count: ${count ?? "N/A"} (expected: exists=true, count=0)`);
      if (!exists || count !== 0) {
        console.error(`UNEXPECTED: "${table}" missing or non-empty after migration.`);
        process.exitCode = 1;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Register the npm script**

In `package.json`, add alongside the other `db:apply-prod-*` entries:

```json
"db:apply-prod-add-bank-reconciliation-migration": "tsx prisma/apply-prod-add-bank-reconciliation-migration.ts",
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/apply-prod-add-bank-reconciliation-migration.ts package.json
git commit -m "Add Payment, BankStatementUpload, and BankTransaction models"
```

---

### Task 3: Domain types and mappers

**Files:**
- Modify: `src/lib/types.ts` (add `Payment`, `BankStatementUpload`, `BankTransaction`, `BankStatementUploadStatus`)
- Modify: `src/lib/mappers.ts` (add `mapPayment`, `mapBankStatementUpload`, `mapBankTransaction`)
- Test: `src/lib/mappers.test.ts`

**Interfaces:**
- Consumes: `toIsoDate` from `src/lib/dateSerialization.ts` (Task 1).
- Produces:
  - `Payment { id: string; invoiceId: string; installmentId?: string; amount: number; paidDate: string; reconciledAt?: string; bankTransactionId?: string }`
  - `BankStatementUpload { id: string; fileUrl: string; fileName: string; status: BankStatementUploadStatus; errorMessage?: string; createdAt: string; reviewedAt?: string }`
  - `BankTransaction { id: string; uploadId: string; date: string; description: string; amount: number; ignoredAt?: string }`
  - `mapPayment(row): Payment`, `mapBankStatementUpload(row): BankStatementUpload`, `mapBankTransaction(row): BankTransaction` — used by Task 7, 8, 10, 12.

- [ ] **Step 1: Add domain types**

In `src/lib/types.ts`, add:

```ts
export type BankStatementUploadStatus =
  | "uploaded"
  | "parsing"
  | "needs_review"
  | "failed"
  | "reviewed";

export interface Payment {
  id: string;
  invoiceId: string;
  installmentId?: string;
  amount: number;
  paidDate: string;
  reconciledAt?: string;
  bankTransactionId?: string;
}

export interface BankStatementUpload {
  id: string;
  fileUrl: string;
  fileName: string;
  status: BankStatementUploadStatus;
  errorMessage?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface BankTransaction {
  id: string;
  uploadId: string;
  date: string;
  description: string;
  amount: number;
  ignoredAt?: string;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/mappers.test.ts
import { describe, expect, it } from "vitest";
import { mapBankStatementUpload, mapBankTransaction, mapPayment } from "./mappers";

describe("mapPayment", () => {
  it("maps a fully-populated row, resolving invoiceId to the invoice number", () => {
    const result = mapPayment({
      id: "pay_1",
      amount: 500,
      paidDate: new Date("2026-03-01T00:00:00.000Z"),
      installmentId: "inst_1",
      reconciledAt: new Date("2026-03-02T00:00:00.000Z"),
      bankTransactionId: "txn_1",
      invoice: { invoiceNumber: "INV-001" },
    });
    expect(result).toEqual({
      id: "pay_1",
      invoiceId: "INV-001",
      installmentId: "inst_1",
      amount: 500,
      paidDate: "2026-03-01",
      reconciledAt: "2026-03-02",
      bankTransactionId: "txn_1",
    });
  });

  it("maps null optional fields to undefined, never null", () => {
    const result = mapPayment({
      id: "pay_2",
      amount: 200,
      paidDate: new Date("2026-03-01T00:00:00.000Z"),
      installmentId: null,
      reconciledAt: null,
      bankTransactionId: null,
      invoice: { invoiceNumber: "INV-002" },
    });
    expect(result.installmentId).toBeUndefined();
    expect(result.reconciledAt).toBeUndefined();
    expect(result.bankTransactionId).toBeUndefined();
  });
});

describe("mapBankStatementUpload", () => {
  it("maps a row with all fields present", () => {
    const result = mapBankStatementUpload({
      id: "up_1",
      fileUrl: "https://blob.example/statement.pdf",
      fileName: "statement.pdf",
      status: "reviewed",
      errorMessage: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      reviewedAt: new Date("2026-03-02T00:00:00.000Z"),
    });
    expect(result).toEqual({
      id: "up_1",
      fileUrl: "https://blob.example/statement.pdf",
      fileName: "statement.pdf",
      status: "reviewed",
      errorMessage: undefined,
      createdAt: "2026-03-01",
      reviewedAt: "2026-03-02",
    });
  });
});

describe("mapBankTransaction", () => {
  it("maps a row, defaulting ignoredAt to undefined when null", () => {
    const result = mapBankTransaction({
      id: "txn_1",
      uploadId: "up_1",
      date: new Date("2026-03-01T00:00:00.000Z"),
      description: "Deposit from Jane Doe",
      amount: 500,
      ignoredAt: null,
    });
    expect(result).toEqual({
      id: "txn_1",
      uploadId: "up_1",
      date: "2026-03-01",
      description: "Deposit from Jane Doe",
      amount: 500,
      ignoredAt: undefined,
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `mapPayment`, `mapBankStatementUpload`, `mapBankTransaction` are not exported from `src/lib/mappers.ts`.

- [ ] **Step 4: Implement the mappers**

In `src/lib/mappers.ts`, add the row types and mapper functions, following this file's existing style exactly (local `XRow` type above each mapper, `??`/`?.` resolving `null` to `undefined`, never leaving `null` on the domain type):

```ts
type PaymentRow = {
  id: string;
  amount: number;
  paidDate: Date;
  installmentId: string | null;
  reconciledAt: Date | null;
  bankTransactionId: string | null;
  invoice: { invoiceNumber: string };
};

export function mapPayment(p: PaymentRow): Payment {
  return {
    id: p.id,
    invoiceId: p.invoice.invoiceNumber,
    installmentId: p.installmentId ?? undefined,
    amount: p.amount,
    paidDate: toIsoDate(p.paidDate),
    reconciledAt: p.reconciledAt ? toIsoDate(p.reconciledAt) : undefined,
    bankTransactionId: p.bankTransactionId ?? undefined,
  };
}

type BankStatementUploadRow = {
  id: string;
  fileUrl: string;
  fileName: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

export function mapBankStatementUpload(u: BankStatementUploadRow): BankStatementUpload {
  return {
    id: u.id,
    fileUrl: u.fileUrl,
    fileName: u.fileName,
    status: u.status as BankStatementUploadStatus,
    errorMessage: u.errorMessage ?? undefined,
    createdAt: toIsoDate(u.createdAt),
    reviewedAt: u.reviewedAt ? toIsoDate(u.reviewedAt) : undefined,
  };
}

type BankTransactionRow = {
  id: string;
  uploadId: string;
  date: Date;
  description: string;
  amount: number;
  ignoredAt: Date | null;
};

export function mapBankTransaction(t: BankTransactionRow): BankTransaction {
  return {
    id: t.id,
    uploadId: t.uploadId,
    date: toIsoDate(t.date),
    description: t.description,
    amount: t.amount,
    ignoredAt: t.ignoredAt ?? undefined,
  };
}
```

Add `BankStatementUpload`, `BankStatementUploadStatus`, `BankTransaction`, `Payment` to the `import type { ... } from "./types"` block at the top of `mappers.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all mapper tests, plus the existing `dateSerialization.test.ts` tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/mappers.ts src/lib/mappers.test.ts
git commit -m "Add Payment/BankStatementUpload/BankTransaction domain types and mappers"
```

---

### Task 4: Create `Payment` rows from the three existing payment-recording routes

**Files:**
- Modify: `src/app/api/invoices/[invoiceNumber]/mark-paid/route.ts`
- Modify: `src/app/api/invoices/[invoiceNumber]/settle-payment-plan/route.ts`
- Modify: `src/app/api/installments/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma.payment.create`, `prisma.payment.findFirst`, `prisma.payment.deleteMany` (Task 2). `fromIsoDate`, `todayIso` (existing, already imported in `installments/[id]/route.ts`; need adding to the other two files).
- Produces: every full-invoice payment, lump-sum plan settlement, and individual installment payment now has a corresponding `Payment` row that Task 10's matching logic reads. No response shape changes for any existing caller.

No unit tests here — these routes require a live Postgres connection with seeded data and this codebase has no existing route-test harness (see Global Constraints). Verify manually per Step 4.

- [ ] **Step 1: `mark-paid/route.ts` — create a Payment on full settlement**

Add the import and the `Payment` creation right after the invoice `status`/`balance` update:

```ts
import { fromIsoDate } from "@/lib/dateSerialization";
import { todayIso } from "@/lib/utils";
```

After this existing block:

```ts
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "paid", balance: 0 },
    include: { items: INVOICE_ITEMS_INCLUDE },
  });
```

add:

```ts
  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      amount: invoice.amount,
      paidDate: fromIsoDate(todayIso()),
    },
  });
```

- [ ] **Step 2: `settle-payment-plan/route.ts` — create one lump-sum Payment**

This route already batches its writes in `prisma.$transaction([...])`. Add one more element so the `Payment` insert is atomic with the invoice/installment updates. Change:

```ts
  const [, installmentRows, updatedInvoice, activity] = await prisma.$transaction([
    prisma.installment.updateMany({
      where: { paymentPlanId: plan.id, status: { not: "paid" } },
      data: { status: "paid", paidDate },
    }),
    prisma.installment.findMany({ where: { paymentPlanId: plan.id } }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid", balance: 0 },
      include: { items: INVOICE_ITEMS_INCLUDE },
    }),
    prisma.activityLog.create({
      data: {
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        type: "payment_received",
        message: `Remaining balance of ${amountLabel} (${countLabel}) paid in full — settled by ${session.user.email}.`,
      },
      include: { invoice: true },
    }),
  ]);
```

to:

```ts
  const [, installmentRows, updatedInvoice, activity] = await prisma.$transaction([
    prisma.installment.updateMany({
      where: { paymentPlanId: plan.id, status: { not: "paid" } },
      data: { status: "paid", paidDate },
    }),
    prisma.installment.findMany({ where: { paymentPlanId: plan.id } }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid", balance: 0 },
      include: { items: INVOICE_ITEMS_INCLUDE },
    }),
    prisma.activityLog.create({
      data: {
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        type: "payment_received",
        message: `Remaining balance of ${amountLabel} (${countLabel}) paid in full — settled by ${session.user.email}.`,
      },
      include: { invoice: true },
    }),
    prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: remaining,
        paidDate,
      },
    }),
  ]);
```

(One `Payment` for the whole lump sum, not one per installment settled — a single bank deposit is what "settle payment plan" actually corresponds to; the destructuring array doesn't need a 5th name since the created `Payment` row isn't used later in this handler.)

- [ ] **Step 3: `installments/[id]/route.ts` — create/delete Payment on the paid/unpaid toggle**

This file's existing `$transaction` covers only `installment.update` + `invoice.update`. Add the `Payment` lifecycle as separate sequential steps immediately after it, matching this file's existing style of doing activity-log/receipt work outside that core transaction. Change:

```ts
  const [updated, updatedInvoice] = await prisma.$transaction([
    prisma.installment.update({
      where: { id },
      data: {
        status: nowPaid ? "paid" : "pending",
        paidDate: nowPaid ? fromIsoDate(todayIso()) : null,
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { balance: newBalance, status: newStatus },
      include: { items: INVOICE_ITEMS_INCLUDE },
    }),
  ]);
```

to (adding the pre-check before, and the create/delete after):

```ts
  if (!nowPaid) {
    const existingPayment = await prisma.payment.findFirst({
      where: { installmentId: installment.id },
    });
    if (existingPayment?.reconciledAt) {
      return NextResponse.json(
        {
          error:
            "This installment's payment has already been reconciled with a bank transaction — unlink it in Reconciliation before reversing.",
        },
        { status: 400 }
      );
    }
  }

  const [updated, updatedInvoice] = await prisma.$transaction([
    prisma.installment.update({
      where: { id },
      data: {
        status: nowPaid ? "paid" : "pending",
        paidDate: nowPaid ? fromIsoDate(todayIso()) : null,
      },
    }),
    prisma.invoice.update({
      where: { id: invoice.id },
      data: { balance: newBalance, status: newStatus },
      include: { items: INVOICE_ITEMS_INCLUDE },
    }),
  ]);

  if (nowPaid) {
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        installmentId: installment.id,
        amount: installment.amount,
        paidDate: fromIsoDate(todayIso()),
      },
    });
  } else {
    await prisma.payment.deleteMany({ where: { installmentId: installment.id } });
  }
```

The reversal-block check must run **before** the `$transaction` so a reconciled installment's balance/status is never touched at all if reversal is refused.

- [ ] **Step 4: Manual verification**

With the dev server running (`npm run dev`) against a dev database:
1. Create an invoice with no payment plan, mark it paid via the UI. Run `npx prisma studio`, open the `Payment` table, confirm one row exists with the correct `invoiceId`/`amount`/`paidDate`.
2. Create an invoice with a payment plan of 2 installments, settle the whole plan via "settle payment plan." Confirm exactly one `Payment` row was created for the summed remaining amount (not two).
3. Create another payment-plan invoice, mark a single installment paid individually. Confirm a `Payment` row exists with `installmentId` set to that installment.
4. Toggle that same installment back to unpaid. Confirm its `Payment` row is gone.
5. In Prisma Studio, manually set `reconciledAt` on a `Payment` row tied to an installment, then try toggling that installment unpaid via the UI. Confirm the request is rejected with the "already been reconciled" message and the installment/invoice/balance are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/invoices/[invoiceNumber]/mark-paid/route.ts src/app/api/invoices/[invoiceNumber]/settle-payment-plan/route.ts src/app/api/installments/[id]/route.ts
git commit -m "Create Payment records from mark-paid, settle-payment-plan, and installment toggling"
```

---

### Task 5: PDF validation helpers

**Files:**
- Create: `src/lib/pdfValidation.ts`
- Test: `src/lib/pdfValidation.test.ts`

**Interfaces:**
- Produces: `isPdfBuffer(buffer: Buffer): boolean`, `looksLikeScannedPdf(extractedText: string, pageCount: number): boolean` — used by Task 7's upload/parse orchestration route.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/pdfValidation.test.ts
import { describe, expect, it } from "vitest";
import { isPdfBuffer, looksLikeScannedPdf } from "./pdfValidation";

describe("isPdfBuffer", () => {
  it("accepts a buffer starting with the %PDF- magic bytes", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.4\n..."))).toBe(true);
  });

  it("rejects a buffer that doesn't start with %PDF-", () => {
    expect(isPdfBuffer(Buffer.from("not a pdf at all"))).toBe(false);
  });

  it("rejects a buffer shorter than the magic bytes", () => {
    expect(isPdfBuffer(Buffer.from("%PD"))).toBe(false);
  });
});

describe("looksLikeScannedPdf", () => {
  it("flags a page with almost no extracted text as scanned", () => {
    expect(looksLikeScannedPdf("", 1)).toBe(true);
    expect(looksLikeScannedPdf("Page 3", 1)).toBe(true);
  });

  it("does not flag a page with a normal amount of text", () => {
    const text = "Date Description Amount\n".repeat(20); // ~500 chars for 1 page
    expect(looksLikeScannedPdf(text, 1)).toBe(false);
  });

  it("averages across multiple pages", () => {
    const text = "x".repeat(300); // 100 chars/page over 3 pages — above the 50 threshold
    expect(looksLikeScannedPdf(text, 3)).toBe(false);
    const scannedText = "x".repeat(60); // 20 chars/page over 3 pages — below threshold
    expect(looksLikeScannedPdf(scannedText, 3)).toBe(true);
  });

  it("treats a zero or negative page count as scanned (defensive default)", () => {
    expect(looksLikeScannedPdf("plenty of text here", 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/lib/pdfValidation.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/pdfValidation.ts
const PDF_MAGIC_BYTES = "%PDF-";
const MIN_AVG_CHARS_PER_PAGE = 50;

export function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC_BYTES.length) return false;
  return buffer.subarray(0, PDF_MAGIC_BYTES.length).toString("ascii") === PDF_MAGIC_BYTES;
}

export function looksLikeScannedPdf(extractedText: string, pageCount: number): boolean {
  if (pageCount <= 0) return true;
  const avgCharsPerPage = extractedText.length / pageCount;
  return avgCharsPerPage < MIN_AVG_CHARS_PER_PAGE;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfValidation.ts src/lib/pdfValidation.test.ts
git commit -m "Add PDF magic-byte and scanned-document detection helpers"
```

---

### Task 6: Claude-based statement structuring

**Files:**
- Create: `src/lib/bankStatementExtraction.ts`
- Test: `src/lib/bankStatementExtraction.test.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk` (existing dependency).
- Produces: `interface ParsedStatementRow { date: string; description: string; amount: number }`, `async function extractTransactionsFromStatementText(statementText: string): Promise<ParsedStatementRow[]>` — used by Task 7.

- [ ] **Step 1: Write the failing tests (mocking the Anthropic SDK)**

```ts
// src/lib/bankStatementExtraction.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const { extractTransactionsFromStatementText } = await import("./bankStatementExtraction");

beforeEach(() => {
  mockCreate.mockReset();
});

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

describe("extractTransactionsFromStatementText", () => {
  it("parses a well-formed JSON array response", async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify([
          { date: "2026-03-01", description: "Deposit from Jane Doe", amount: 500 },
          { date: "2026-03-02", description: "ATM withdrawal", amount: -100 },
        ])
      )
    );
    const rows = await extractTransactionsFromStatementText("raw statement text");
    expect(rows).toEqual([
      { date: "2026-03-01", description: "Deposit from Jane Doe", amount: 500 },
      { date: "2026-03-02", description: "ATM withdrawal", amount: -100 },
    ]);
  });

  it("extracts a JSON array even when wrapped in markdown fences", async () => {
    mockCreate.mockResolvedValue(
      textResponse('```json\n[{"date":"2026-03-01","description":"Deposit","amount":500}]\n```')
    );
    const rows = await extractTransactionsFromStatementText("raw statement text");
    expect(rows).toEqual([{ date: "2026-03-01", description: "Deposit", amount: 500 }]);
  });

  it("drops individual rows with an invalid date, non-string description, or non-finite amount", async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify([
          { date: "2026-03-01", description: "Valid row", amount: 500 },
          { date: "not-a-date", description: "Bad date", amount: 100 },
          { date: "2026-03-01", description: 12345, amount: 100 },
          { date: "2026-03-01", description: "Bad amount", amount: "NaN" },
        ])
      )
    );
    const rows = await extractTransactionsFromStatementText("raw statement text");
    expect(rows).toEqual([{ date: "2026-03-01", description: "Valid row", amount: 500 }]);
  });

  it("throws a StatementExtractionError when the response has no parseable JSON", async () => {
    mockCreate.mockResolvedValue(textResponse("I could not extract any transactions."));
    await expect(extractTransactionsFromStatementText("raw statement text")).rejects.toThrow(
      /couldn't parse/i
    );
  });

  it("throws a StatementExtractionError when the API call itself fails", async () => {
    mockCreate.mockRejectedValue(new Error("rate limited"));
    await expect(extractTransactionsFromStatementText("raw statement text")).rejects.toThrow(
      /couldn't parse/i
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/lib/bankStatementExtraction.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/bankStatementExtraction.ts
import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

export interface ParsedStatementRow {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number; // positive = credit/deposit, negative = debit
}

export class StatementExtractionError extends Error {}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRow(row: unknown): row is ParsedStatementRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.date === "string" &&
    ISO_DATE_RE.test(r.date) &&
    typeof r.description === "string" &&
    typeof r.amount === "number" &&
    Number.isFinite(r.amount)
  );
}

function extractRows(text: string): ParsedStatementRow[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new StatementExtractionError("Couldn't parse this statement — no transaction data found in the response.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new StatementExtractionError("Couldn't parse this statement — malformed response.");
  }
  if (!Array.isArray(parsed)) {
    throw new StatementExtractionError("Couldn't parse this statement — unexpected response shape.");
  }
  return parsed.filter(isValidRow);
}

export async function extractTransactionsFromStatementText(
  statementText: string
): Promise<ParsedStatementRow[]> {
  const prompt = `Here is raw text extracted from a bank statement PDF. Extract every transaction row as a JSON array of objects: [{"date": "YYYY-MM-DD", "description": "...", "amount": number}].

Rules:
- amount is positive for a credit/deposit, negative for a debit/withdrawal.
- Ignore headers, footers, page numbers, account summaries, and lines that only show a running balance with no transaction.
- Normalize every date to YYYY-MM-DD regardless of the format shown in the statement.
- Respond with ONLY the JSON array — no prose, no markdown fences, no explanation.

Statement text:
${statementText}`;

  let text: string;
  try {
    const response = await getClient().messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  } catch {
    throw new StatementExtractionError("Couldn't parse this statement — please try again.");
  }

  return extractRows(text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bankStatementExtraction.ts src/lib/bankStatementExtraction.test.ts
git commit -m "Add Claude-based bank statement transaction extraction"
```

---

### Task 7: Upload route and parse orchestration

**Files:**
- Create: `src/app/api/upload/bank-statement/route.ts`
- Create: `src/app/api/bank-statements/route.ts`
- Modify: `package.json` (add `pdf-parse` dependency)

**Interfaces:**
- Consumes: `isPdfBuffer`, `looksLikeScannedPdf` (Task 5), `extractTransactionsFromStatementText`, `StatementExtractionError` (Task 6), `mapBankStatementUpload` (Task 3).
- Produces: `POST /api/upload/bank-statement` (Blob token handshake), `POST /api/bank-statements` (body `{ fileUrl: string, fileName: string }`, returns `{ upload: BankStatementUpload, rows: ParsedStatementRow[] }` on success or `{ upload: BankStatementUpload }` with `upload.status === "failed"` and `upload.errorMessage` set on any parse failure) — consumed by Task 12's upload UI.

- [ ] **Step 1: Add `pdf-parse`**

Run: `npm install pdf-parse`

- [ ] **Step 2: Write the upload token-handshake route**

Modeled on `src/app/api/upload/logo/route.ts`, with `application/pdf` instead of image types and a 15MB cap. `onUploadCompleted` stays a no-op for the same reason the logo route's does — the client calls a separate endpoint (`POST /api/bank-statements`, Step 3) right after `upload()` resolves, which avoids relying on Vercel's completion webhook reaching `localhost` in local dev.

```ts
// src/app/api/upload/bank-statement/route.ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const ALLOWED_CONTENT_TYPES = ["application/pdf"];
const MAX_SIZE_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await auth();
        if (!session?.user) {
          throw new Error("Not authenticated");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      onUploadCompleted: async () => {
        // Intentionally a no-op — the client calls POST /api/bank-statements
        // right after upload() resolves, matching the logo upload's pattern
        // for the same reason: Vercel can't reach a localhost webhook
        // without a tunnel in local dev.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 3: Write the create-and-parse orchestration route**

This performs the server-side re-validation the client-side `allowedContentTypes`/`maximumSizeInBytes` hints above don't actually guarantee (a client can lie about content type in the upload request) — the magic-byte check against the real fetched bytes is the real gate.

```ts
// src/app/api/bank-statements/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankStatementUpload } from "@/lib/mappers";
import { isPdfBuffer, looksLikeScannedPdf } from "@/lib/pdfValidation";
import { extractTransactionsFromStatementText, StatementExtractionError } from "@/lib/bankStatementExtraction";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;

interface CreateBody {
  fileUrl?: unknown;
  fileName?: unknown;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as CreateBody;
  if (typeof body.fileUrl !== "string" || typeof body.fileName !== "string") {
    return NextResponse.json({ error: "fileUrl and fileName are required" }, { status: 400 });
  }
  const { fileUrl, fileName } = body;

  const upload = await prisma.bankStatementUpload.create({
    data: { ownerId: session.user.id, fileUrl, fileName, status: "parsing" },
  });

  const fail = async (errorMessage: string) => {
    const failed = await prisma.bankStatementUpload.update({
      where: { id: upload.id },
      data: { status: "failed", errorMessage },
    });
    return NextResponse.json({ upload: mapBankStatementUpload(failed) });
  };

  let fileResponse: Response;
  try {
    fileResponse = await fetch(fileUrl);
  } catch {
    return fail("Couldn't download the uploaded file — please try again.");
  }
  if (!fileResponse.ok) {
    return fail("Couldn't download the uploaded file — please try again.");
  }
  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_SIZE_BYTES) {
    return fail("This file is larger than the 15MB limit.");
  }
  if (!isPdfBuffer(buffer)) {
    return fail("This file doesn't appear to be a valid PDF.");
  }

  const pdfParse = (await import("pdf-parse")).default;
  let extractedText: string;
  let pageCount: number;
  try {
    const data = await pdfParse(buffer);
    extractedText = data.text;
    pageCount = data.numpages;
  } catch {
    return fail("Couldn't read this PDF — it may be corrupted.");
  }

  if (looksLikeScannedPdf(extractedText, pageCount)) {
    return fail(
      "This looks like a scanned or image-based PDF, which isn't supported yet — please upload a text-based statement export."
    );
  }

  let rows;
  try {
    rows = await extractTransactionsFromStatementText(extractedText);
  } catch (error) {
    if (error instanceof StatementExtractionError) {
      return fail(error.message);
    }
    return fail("Couldn't parse this statement — please try again.");
  }

  const reviewed = await prisma.bankStatementUpload.update({
    where: { id: upload.id },
    data: { status: "needs_review", parsedRowsJson: rows },
  });

  return NextResponse.json({ upload: mapBankStatementUpload(reviewed), rows });
}
```

- [ ] **Step 4: Manual verification**

With the dev server running:
1. Try uploading a non-PDF file renamed to `.pdf` (e.g. a text file) — confirm the response has `upload.status === "failed"` with the "doesn't appear to be a valid PDF" message, and check `npx prisma studio` to confirm the `BankStatementUpload` row's `status` is `"failed"`.
2. Upload a real, small, text-based PDF (e.g. export any existing invoice-like document, or use any sample text PDF you have) — confirm `rows` comes back non-empty and `upload.status === "needs_review"`, and `parsedRowsJson` is populated in Prisma Studio.
3. Temporarily set an invalid `ANTHROPIC_API_KEY` env var and repeat step 2 — confirm the route returns `status: "failed"` with the generic retry message rather than a 500/uncaught exception, then restore the real key.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/upload/bank-statement/route.ts src/app/api/bank-statements/route.ts package.json package-lock.json
git commit -m "Add bank statement upload and PDF parsing pipeline"
```

---

### Task 8: Review/correction UI and confirm endpoint

**Files:**
- Create: `src/app/api/bank-statements/[id]/route.ts`
- Create: `src/app/(app)/reconciliation/[uploadId]/review/page.tsx`

**Interfaces:**
- Consumes: `mapBankTransaction` (Task 3), `ParsedStatementRow` shape (Task 6).
- Produces: `PATCH /api/bank-statements/[id]` (body `{ rows: ParsedStatementRow[] }`, materializes `BankTransaction` rows, sets `status: "reviewed"`), consumed by the review page below and by Task 12's navigation flow.

No unit tests (route needs a live DB; page is a UI component with no existing RTL/jsdom convention in this codebase — verify manually per Step 3, consistent with Global Constraints).

- [ ] **Step 1: Write the confirm-review route**

```ts
// src/app/api/bank-statements/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankStatementUpload } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";

interface ReviewRow {
  date?: unknown;
  description?: unknown;
  amount?: unknown;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRows(raw: unknown): { date: string; description: string; amount: number }[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: { date: string; description: string; amount: number }[] = [];
  for (const entry of raw as ReviewRow[]) {
    if (
      typeof entry.date !== "string" ||
      !ISO_DATE_RE.test(entry.date) ||
      typeof entry.description !== "string" ||
      !entry.description.trim() ||
      typeof entry.amount !== "number" ||
      !Number.isFinite(entry.amount)
    ) {
      return null;
    }
    rows.push({ date: entry.date, description: entry.description.trim(), amount: entry.amount });
  }
  return rows;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const upload = await prisma.bankStatementUpload.findFirst({
    where: { id, ownerId: session.user.id },
  });
  if (!upload) return NextResponse.json({ error: "upload not found" }, { status: 404 });

  const body = (await request.json()) as { rows?: unknown };
  const rows = parseRows(body.rows);
  if (!rows) {
    return NextResponse.json({ error: "invalid rows" }, { status: 400 });
  }

  const [, updatedUpload] = await prisma.$transaction([
    prisma.bankTransaction.createMany({
      data: rows.map((row, index) => ({
        uploadId: upload.id,
        ownerId: session.user.id,
        date: fromIsoDate(row.date),
        description: row.description,
        amount: row.amount,
        position: index,
      })),
    }),
    prisma.bankStatementUpload.update({
      where: { id: upload.id },
      data: { status: "reviewed", reviewedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ upload: mapBankStatementUpload(updatedUpload) });
}
```

- [ ] **Step 2: Write the review page**

A client component that fetches the upload's `parsedRowsJson` via a small inline `GET`, lets the user edit/delete/add rows, then `PATCH`es on confirm. To keep this task self-contained, the page fetches the upload directly via Prisma in a server component wrapper, passing the initial rows to a client sub-component for editing.

```tsx
// src/app/(app)/reconciliation/[uploadId]/review/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { ReviewRowsEditor } from "./ReviewRowsEditor";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ uploadId: string }>;
}) {
  const { uploadId } = await params;
  const session = await auth();
  if (!session?.user) notFound();

  const upload = await prisma.bankStatementUpload.findFirst({
    where: { id: uploadId, ownerId: session.user.id },
  });
  if (!upload) notFound();

  const initialRows = Array.isArray(upload.parsedRowsJson)
    ? (upload.parsedRowsJson as { date: string; description: string; amount: number }[])
    : [];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-slate-900">Review parsed transactions</h1>
      <p className="mt-1 text-sm text-slate-500">
        {upload.fileName} — fix any misread rows before matching runs.
      </p>
      <ReviewRowsEditor uploadId={upload.id} initialRows={initialRows} />
    </div>
  );
}
```

```tsx
// src/app/(app)/reconciliation/[uploadId]/review/ReviewRowsEditor.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  date: string;
  description: string;
  amount: number;
}

export function ReviewRowsEditor({
  uploadId,
  initialRows,
}: {
  uploadId: string;
  initialRows: Row[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, field: keyof Row, value: string) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: field === "amount" ? Number(value) : value } : row
      )
    );
  }

  function deleteRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((prev) => [...prev, { date: "", description: "", amount: 0 }]);
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/bank-statements/${uploadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save these rows.");
        return;
      }
      router.push("/reconciliation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-400">
            <th className="pb-2">Date</th>
            <th className="pb-2">Description</th>
            <th className="pb-2">Amount</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-slate-100">
              <td className="py-1.5 pr-2">
                <input
                  type="date"
                  value={row.date}
                  onChange={(e) => updateRow(index, "date", e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1"
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) => updateRow(index, "description", e.target.value)}
                  className="w-full rounded border border-slate-200 px-2 py-1"
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  type="number"
                  step="0.01"
                  value={row.amount}
                  onChange={(e) => updateRow(index, "amount", e.target.value)}
                  className="w-32 rounded border border-slate-200 px-2 py-1"
                />
              </td>
              <td className="py-1.5">
                <button type="button" onClick={() => deleteRow(index)} className="text-xs text-rose-500">
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addRow} className="mt-3 text-sm text-blue-600">
        + Add row
      </button>
      {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
      <div className="mt-6">
        <button
          type="button"
          onClick={confirm}
          disabled={saving || rows.length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Confirm and continue"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

1. From Task 7's parsed upload, navigate to `/reconciliation/<uploadId>/review` and confirm the parsed rows render in the table.
2. Edit a row's amount, delete a row, add a new row, then click "Confirm and continue."
3. In Prisma Studio, confirm `BankTransaction` rows now exist matching exactly what was in the table (including the edit/delete/add), `position` values are sequential, and the `BankStatementUpload.status` is `"reviewed"` with `reviewedAt` set.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/bank-statements/[id]/route.ts" "src/app/(app)/reconciliation/[uploadId]/review"
git commit -m "Add bank statement review/correction UI and confirm endpoint"
```

---

### Task 9: Matching algorithm

**Files:**
- Create: `src/lib/reconciliationMatching.ts`
- Test: `src/lib/reconciliationMatching.test.ts`

**Interfaces:**
- Produces:
  - `interface MatchableBankTransaction { id: string; amount: number; dateIso: string }`
  - `interface MatchablePayment { id: string; amount: number; paidDateIso: string }`
  - `interface TransactionMatchCandidates { transactionId: string; candidatePaymentIds: string[] }`
  - `function computeMatchCandidates(transactions: MatchableBankTransaction[], payments: MatchablePayment[]): TransactionMatchCandidates[]`
  - Used by Task 10. Caller is responsible for pre-filtering inputs to unmatched, non-ignored, positive-amount transactions and unreconciled payments — this function has one job: pairing by amount/date, nothing else.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/reconciliationMatching.test.ts
import { describe, expect, it } from "vitest";
import { computeMatchCandidates } from "./reconciliationMatching";

describe("computeMatchCandidates", () => {
  it("matches a transaction to its one exact same-amount, same-day payment", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: ["pay_1"] }]);
  });

  it("matches within the 3-day tolerance window in either direction", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-04" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: ["pay_1"] }]);
  });

  it("does not match beyond the 3-day tolerance window", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-05" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: [] }]);
  });

  it("returns every candidate when multiple payments match ambiguously", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01" }],
      [
        { id: "pay_1", amount: 500, paidDateIso: "2026-03-01" },
        { id: "pay_2", amount: 500, paidDateIso: "2026-03-02" },
      ]
    );
    expect(result[0].transactionId).toBe("txn_1");
    expect(result[0].candidatePaymentIds.sort()).toEqual(["pay_1", "pay_2"]);
  });

  it("does not match on a different amount even on the same day", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500, dateIso: "2026-03-01" }],
      [{ id: "pay_1", amount: 499, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: [] }]);
  });

  it("tolerates float rounding within the epsilon", () => {
    const result = computeMatchCandidates(
      [{ id: "txn_1", amount: 500.005, dateIso: "2026-03-01" }],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result).toEqual([{ transactionId: "txn_1", candidatePaymentIds: ["pay_1"] }]);
  });

  it("returns one entry per input transaction, in input order", () => {
    const result = computeMatchCandidates(
      [
        { id: "txn_1", amount: 500, dateIso: "2026-03-01" },
        { id: "txn_2", amount: 999, dateIso: "2026-03-01" },
      ],
      [{ id: "pay_1", amount: 500, paidDateIso: "2026-03-01" }]
    );
    expect(result.map((r) => r.transactionId)).toEqual(["txn_1", "txn_2"]);
    expect(result[1].candidatePaymentIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/lib/reconciliationMatching.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/reconciliationMatching.ts
export interface MatchableBankTransaction {
  id: string;
  amount: number;
  dateIso: string; // yyyy-mm-dd
}

export interface MatchablePayment {
  id: string;
  amount: number;
  paidDateIso: string; // yyyy-mm-dd
}

export interface TransactionMatchCandidates {
  transactionId: string;
  candidatePaymentIds: string[];
}

const AMOUNT_EPSILON = 0.01;
const TOLERANCE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  const diff = new Date(`${a}T00:00:00.000Z`).getTime() - new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.abs(diff) / MS_PER_DAY;
}

export function computeMatchCandidates(
  transactions: MatchableBankTransaction[],
  payments: MatchablePayment[]
): TransactionMatchCandidates[] {
  return transactions.map((transaction) => {
    const candidatePaymentIds = payments
      .filter(
        (payment) =>
          Math.abs(payment.amount - transaction.amount) <= AMOUNT_EPSILON &&
          daysBetween(payment.paidDateIso, transaction.dateIso) <= TOLERANCE_DAYS
      )
      .map((payment) => payment.id);
    return { transactionId: transaction.id, candidatePaymentIds };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reconciliationMatching.ts src/lib/reconciliationMatching.test.ts
git commit -m "Add pure payment-to-transaction matching algorithm"
```

---

### Task 10: Reconciliation matches API (buckets, confirm, reject, ignore)

**Files:**
- Create: `src/app/api/reconciliation/matches/route.ts`
- Create: `src/app/api/reconciliation/matches/[paymentId]/route.ts`
- Create: `src/app/api/reconciliation/transactions/[transactionId]/route.ts`

**Interfaces:**
- Consumes: `computeMatchCandidates`, `MatchableBankTransaction`, `MatchablePayment` (Task 9); `mapPayment`, `mapBankTransaction` (Task 3); `requireFreshPasswordConfirmation` (existing, `src/lib/passwordConfirmation.ts`).
- Produces:
  - `GET /api/reconciliation/matches` → `{ matched: { payment: Payment; transaction: BankTransaction }[], needsReview: { transaction: BankTransaction; candidates: Payment[] }[], unmatchedOurs: Payment[], unmatchedBank: BankTransaction[] }`
  - `POST /api/reconciliation/matches` (body `{ paymentId: string; bankTransactionId: string }`) → confirms a match (accept-suggested, pick-from-Needs-Review, or manual link — same action)
  - `DELETE /api/reconciliation/matches/[paymentId]` → unlinks/rejects
  - `PATCH /api/reconciliation/transactions/[transactionId]` (body `{ ignored: true }`) → sets `ignoredAt`
  - Consumed by Task 12's bucket screen.

No unit tests (requires live DB — see Global Constraints); verify manually per Step 5.

- [ ] **Step 1: Write the GET buckets route**

```ts
// src/app/api/reconciliation/matches/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankTransaction, mapPayment } from "@/lib/mappers";
import { computeMatchCandidates } from "@/lib/reconciliationMatching";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = session.user.id;

  const [confirmedPayments, unmatchedPaymentRows, candidateTransactionRows] = await Promise.all([
    prisma.payment.findMany({
      where: { bankTransactionId: { not: null }, invoice: { client: { ownerId } } },
      include: { invoice: { select: { invoiceNumber: true } }, bankTransaction: true },
    }),
    prisma.payment.findMany({
      where: { reconciledAt: null, invoice: { client: { ownerId } } },
      include: { invoice: { select: { invoiceNumber: true } } },
    }),
    prisma.bankTransaction.findMany({
      where: { ownerId, ignoredAt: null, amount: { gt: 0 }, payment: null },
    }),
  ]);

  const matched = confirmedPayments
    .filter((p) => p.bankTransaction)
    .map((p) => ({
      payment: mapPayment(p),
      transaction: mapBankTransaction(p.bankTransaction!),
    }));

  const candidateResults = computeMatchCandidates(
    candidateTransactionRows.map((t) => ({ id: t.id, amount: t.amount, dateIso: t.date.toISOString().slice(0, 10) })),
    unmatchedPaymentRows.map((p) => ({ id: p.id, amount: p.amount, paidDateIso: p.paidDate.toISOString().slice(0, 10) }))
  );

  const paymentById = new Map(unmatchedPaymentRows.map((p) => [p.id, p]));
  const transactionById = new Map(candidateTransactionRows.map((t) => [t.id, t]));

  const needsReview: { transaction: ReturnType<typeof mapBankTransaction>; candidates: ReturnType<typeof mapPayment>[] }[] = [];
  const autoMatchable: { transactionId: string; paymentId: string }[] = [];
  const unmatchedBankIds = new Set(candidateTransactionRows.map((t) => t.id));
  const matchedPaymentIds = new Set<string>();

  for (const result of candidateResults) {
    if (result.candidatePaymentIds.length === 1) {
      autoMatchable.push({ transactionId: result.transactionId, paymentId: result.candidatePaymentIds[0] });
      matchedPaymentIds.add(result.candidatePaymentIds[0]);
      unmatchedBankIds.delete(result.transactionId);
    } else if (result.candidatePaymentIds.length > 1) {
      needsReview.push({
        transaction: mapBankTransaction(transactionById.get(result.transactionId)!),
        candidates: result.candidatePaymentIds.map((id) => mapPayment(paymentById.get(id)!)),
      });
      unmatchedBankIds.delete(result.transactionId);
    }
  }

  const unmatchedOurs = unmatchedPaymentRows.filter((p) => !matchedPaymentIds.has(p.id)).map(mapPayment);
  const unmatchedBank = candidateTransactionRows.filter((t) => unmatchedBankIds.has(t.id)).map(mapBankTransaction);

  const suggested = autoMatchable.map(({ transactionId, paymentId }) => ({
    payment: mapPayment(paymentById.get(paymentId)!),
    transaction: mapBankTransaction(transactionById.get(transactionId)!),
  }));

  return NextResponse.json({
    matched,
    suggested,
    needsReview,
    unmatchedOurs,
    unmatchedBank,
  });
}
```

Note: `matched` (already confirmed) and `suggested` (one-click-confirm candidates awaiting user action) are returned as separate arrays — the spec's "Matched" bucket in the UI renders both, with `suggested` entries showing a confirm button and `matched` entries showing a reject button.

- [ ] **Step 2: Write the confirm/reject route**

```ts
// src/app/api/reconciliation/matches/route.ts (same file, add POST below GET)
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";

interface ConfirmBody {
  paymentId?: unknown;
  bankTransactionId?: unknown;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const body = (await request.json()) as ConfirmBody;
  if (typeof body.paymentId !== "string" || typeof body.bankTransactionId !== "string") {
    return NextResponse.json({ error: "paymentId and bankTransactionId are required" }, { status: 400 });
  }

  const payment = await prisma.payment.findFirst({
    where: { id: body.paymentId, invoice: { client: { ownerId: session.user.id } } },
  });
  if (!payment) return NextResponse.json({ error: "payment not found" }, { status: 404 });

  const transaction = await prisma.bankTransaction.findFirst({
    where: { id: body.bankTransactionId, ownerId: session.user.id, payment: null },
  });
  if (!transaction) return NextResponse.json({ error: "bank transaction not found or already matched" }, { status: 404 });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { reconciledAt: new Date(), bankTransactionId: transaction.id },
    include: { invoice: { select: { invoiceNumber: true } }, bankTransaction: true },
  });

  return NextResponse.json({ payment: mapPayment(updated) });
}
```

```ts
// src/app/api/reconciliation/matches/[paymentId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { requireFreshPasswordConfirmation } from "@/lib/passwordConfirmation";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const confirmError = await requireFreshPasswordConfirmation(session.user.id);
  if (confirmError) return confirmError;

  const { paymentId } = await params;
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, invoice: { client: { ownerId: session.user.id } } },
  });
  if (!payment) return NextResponse.json({ error: "payment not found" }, { status: 404 });

  await prisma.payment.update({
    where: { id: paymentId },
    data: { reconciledAt: null, bankTransactionId: null },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write the ignore-transaction route**

Not gated on `requireFreshPasswordConfirmation` — ignoring a transaction is bookkeeping metadata on the `BankTransaction`, not a money-moving action on a `Payment`, matching this codebase's existing convention (see Global Constraints).

```ts
// src/app/api/reconciliation/transactions/[transactionId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankTransaction } from "@/lib/mappers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transactionId } = await params;
  const body = (await request.json()) as { ignored?: unknown };
  if (body.ignored !== true) {
    return NextResponse.json({ error: "only { ignored: true } is supported" }, { status: 400 });
  }

  const transaction = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, ownerId: session.user.id },
  });
  if (!transaction) return NextResponse.json({ error: "transaction not found" }, { status: 404 });

  const updated = await prisma.bankTransaction.update({
    where: { id: transactionId },
    data: { ignoredAt: new Date() },
  });

  return NextResponse.json({ transaction: mapBankTransaction(updated) });
}
```

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit` — confirm no type errors across the three new route files.

- [ ] **Step 5: Manual verification**

With seeded data from Task 4/8 (at least one confirmed `BankTransaction` whose amount/date exactly matches an unreconciled `Payment`, one ambiguous pair, and one of each unmatched side):
1. `GET /api/reconciliation/matches` — confirm the four/five arrays partition your seeded data correctly (exact match → `suggested`, ambiguous → `needsReview`, others → `unmatchedOurs`/`unmatchedBank`).
2. `POST /api/reconciliation/matches` with a suggested pairing — confirm it moves into `matched` on the next `GET`, and `Payment.reconciledAt`/`bankTransactionId` are set in Prisma Studio.
3. `DELETE /api/reconciliation/matches/[paymentId]` on that same payment — confirm it reappears in `unmatchedOurs`/`unmatchedBank` on the next `GET`.
4. `PATCH /api/reconciliation/transactions/[transactionId]` with `{ ignored: true }` on an unmatched bank transaction — confirm it disappears from `unmatchedBank` on the next `GET`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/reconciliation"
git commit -m "Add reconciliation matches API: buckets, confirm, reject, ignore"
```

---

### Task 11: Nav item

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Produces: a working `/reconciliation` link in the sidebar for Task 12's pages to be reachable from.

- [ ] **Step 1: Add the nav entry**

In `NAV_ITEMS`, insert between the Invoices and Templates entries:

```ts
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: DashboardIcon },
  { href: "/clients", label: "Clients", icon: ClientsIcon },
  { href: "/invoices", label: "Invoices", icon: InvoicesIcon },
  { href: "/reconciliation", label: "Reconciliation", icon: ReconciliationIcon },
  { href: "/templates", label: "Templates", icon: TemplatesIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];
```

- [ ] **Step 2: Add the icon component**

At the bottom of the file, alongside the other `XIcon` functions, matching their exact signature:

```tsx
function ReconciliationIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h9a1.5 1.5 0 0 1 1.5 1.5V17" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 20H7a1.5 1.5 0 0 1-1.5-1.5V7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 7 2.5-2.5M5 7l2.5 2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m19 17-2.5 2.5M19 17l-2.5-2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12.5 11 14l3.5-3.5" />
    </svg>
  );
}
```

(Two circling arrows framing a checkmark — reads as "reconcile/match," distinct from every other existing icon's shape vocabulary.)

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in, confirm "Reconciliation" appears between Invoices and Templates in the sidebar, with correct active-state highlighting when visiting `/reconciliation` (built in Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "Add Reconciliation nav item"
```

---

### Task 12: Upload list and three-bucket screen

**Files:**
- Create: `src/app/(app)/reconciliation/page.tsx`
- Create: `src/app/(app)/reconciliation/UploadStatementButton.tsx`
- Create: `src/app/(app)/reconciliation/MatchBuckets.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/reconciliation/matches`, `DELETE /api/reconciliation/matches/[paymentId]`, `PATCH /api/reconciliation/transactions/[transactionId]` (Task 10); `POST /api/upload/bank-statement`, `POST /api/bank-statements` (Task 7); `mapBankStatementUpload` (Task 3).
- Produces: the user-facing `/reconciliation` page — the final integration point of every prior task.

No unit tests (UI component, no existing RTL/jsdom convention — see Global Constraints); verify manually per Step 4.

- [ ] **Step 1: Upload button (client component)**

Mirrors `LogoUploadField.tsx`'s upload-then-callback shape, but PDF-typed and chained into the create+parse route, then navigates to the review page.

```tsx
// src/app/(app)/reconciliation/UploadStatementButton.tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;

export function UploadStatementButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("File must be smaller than 15MB.");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const blob = await upload(`bank-statements/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/bank-statement",
      });
      const response = await fetch("/api/bank-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: blob.url, fileName: file.name }),
      });
      const data = await response.json();
      if (data.upload.status === "failed") {
        setError(data.upload.errorMessage ?? "Couldn't process this statement.");
        return;
      }
      router.push(`/reconciliation/${data.upload.id}/review`);
    } catch {
      setError("Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {uploading ? "Uploading…" : "Upload bank statement"}
      </button>
      {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
```

- [ ] **Step 2: Bucket screen (client component)**

```tsx
// src/app/(app)/reconciliation/MatchBuckets.tsx
"use client";

import { useEffect, useState } from "react";

interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  paidDate: string;
}
interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
}
interface MatchesResponse {
  matched: { payment: Payment; transaction: BankTransaction }[];
  suggested: { payment: Payment; transaction: BankTransaction }[];
  needsReview: { transaction: BankTransaction; candidates: Payment[] }[];
  unmatchedOurs: Payment[];
  unmatchedBank: BankTransaction[];
}

export function MatchBuckets() {
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/reconciliation/matches");
    if (!response.ok) {
      setError("Couldn't load reconciliation data.");
      return;
    }
    setData(await response.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmMatch(paymentId: string, bankTransactionId: string) {
    const response = await fetch("/api/reconciliation/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, bankTransactionId }),
    });
    if (response.ok) load();
  }

  async function rejectMatch(paymentId: string) {
    const response = await fetch(`/api/reconciliation/matches/${paymentId}`, { method: "DELETE" });
    if (response.ok) load();
  }

  async function ignoreTransaction(transactionId: string) {
    const response = await fetch(`/api/reconciliation/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ignored: true }),
    });
    if (response.ok) load();
  }

  if (error) return <p className="text-sm text-rose-500">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-slate-900">Matched</h2>
        <ul className="mt-2 space-y-2">
          {data.matched.map(({ payment, transaction }) => (
            <li key={payment.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
              <span>
                {transaction.date} — {transaction.description} — {transaction.amount} ↔ Invoice {payment.invoiceId}
              </span>
              <button onClick={() => rejectMatch(payment.id)} className="text-xs text-rose-500">
                Undo
              </button>
            </li>
          ))}
          {data.suggested.map(({ payment, transaction }) => (
            <li key={payment.id} className="flex items-center justify-between rounded border border-blue-200 bg-blue-50 p-3 text-sm">
              <span>
                Suggested: {transaction.date} — {transaction.description} — {transaction.amount} ↔ Invoice {payment.invoiceId}
              </span>
              <button
                onClick={() => confirmMatch(payment.id, transaction.id)}
                className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
              >
                Confirm
              </button>
            </li>
          ))}
          {data.matched.length === 0 && data.suggested.length === 0 && (
            <li className="text-sm text-slate-400">Nothing matched yet.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Needs review</h2>
        <ul className="mt-2 space-y-2">
          {data.needsReview.map(({ transaction, candidates }) => (
            <li key={transaction.id} className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
              <p>
                {transaction.date} — {transaction.description} — {transaction.amount}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    onClick={() => confirmMatch(candidate.id, transaction.id)}
                    className="rounded border border-amber-400 px-2 py-1 text-xs"
                  >
                    Invoice {candidate.invoiceId} ({candidate.paidDate})
                  </button>
                ))}
                <button onClick={() => ignoreTransaction(transaction.id)} className="text-xs text-slate-500">
                  Ignore
                </button>
              </div>
            </li>
          ))}
          {data.needsReview.length === 0 && <li className="text-sm text-slate-400">Nothing needs review.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Unmatched — Ours</h2>
        <ul className="mt-2 space-y-2">
          {data.unmatchedOurs.map((payment) => (
            <li key={payment.id} className="rounded border border-slate-200 p-3 text-sm">
              Invoice {payment.invoiceId} — {payment.amount} paid {payment.paidDate}
            </li>
          ))}
          {data.unmatchedOurs.length === 0 && <li className="text-sm text-slate-400">Nothing unmatched.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Unmatched — Bank</h2>
        <ul className="mt-2 space-y-2">
          {data.unmatchedBank.map((transaction) => (
            <li key={transaction.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
              <span>
                {transaction.date} — {transaction.description} — {transaction.amount}
              </span>
              <button onClick={() => ignoreTransaction(transaction.id)} className="text-xs text-slate-500">
                Ignore
              </button>
            </li>
          ))}
          {data.unmatchedBank.length === 0 && <li className="text-sm text-slate-400">Nothing unmatched.</li>}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Page shell**

```tsx
// src/app/(app)/reconciliation/page.tsx
import { UploadStatementButton } from "./UploadStatementButton";
import { MatchBuckets } from "./MatchBuckets";

export default function ReconciliationPage() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Reconciliation</h1>
        <UploadStatementButton />
      </div>
      <MatchBuckets />
    </div>
  );
}
```

- [ ] **Step 4: Manual verification — full end-to-end path**

1. `npm run dev`, log in, navigate to `/reconciliation` via the sidebar link (Task 11).
2. Upload a real text-based bank statement PDF. Confirm redirect to the review page with parsed rows.
3. Edit/confirm the rows. Confirm redirect back to `/reconciliation`.
4. With a `Payment` already seeded (from Task 4) matching one of the uploaded transactions exactly, confirm it shows under "Matched" as a suggested pairing; click Confirm and verify it moves to the confirmed list and stays there after a page refresh.
5. Seed two payments with the same amount/date to produce a "Needs review" entry; verify the candidate picker resolves it correctly and it disappears from Needs Review afterward.
6. Verify an unrelated deposit (bank fee reversal, etc.) can be Ignored from "Unmatched — Bank" and disappears after refresh.
7. Run `npm run lint` and `npx tsc --noEmit` across the whole project — confirm no errors introduced by this feature.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/reconciliation"
git commit -m "Add reconciliation upload list and three-bucket matching screen"
```

---

## Self-Review

**Spec coverage:**
- Payment model + write-back (`reconciledAt`/`bankTransactionId`) → Task 2, 4, 10. ✓
- PDF parsing pipeline (magic-byte validation, scanned-PDF guard, pdf-parse → Claude structuring, API-failure handling) → Task 5, 6, 7. ✓
- Review/correction UI → Task 8. ✓
- Matching algorithm (exact amount, ±3 days, ambiguity → Needs Review) → Task 9, 10. ✓
- Three buckets + manual link + ignore → Task 10, 12. ✓
- Nav placement → Task 11. ✓
- Server-side content-type re-validation (the reviewer-flagged gap) → Task 7, Step 3 (magic-byte + size check against actual fetched bytes, independent of client-declared content type). ✓

**Placeholder scan:** no "TBD"/"handle errors appropriately"/etc. remain — every step has literal code or a literal manual-verification procedure.

**Type consistency:** `Payment`/`BankStatementUpload`/`BankTransaction` domain types (Task 3) are the same shape used by every mapper call site in Tasks 7, 8, 10, 12. `ParsedStatementRow` (Task 6) matches the row shape consumed in Task 7 and Task 8's review editor. `computeMatchCandidates`'s `MatchableBankTransaction`/`MatchablePayment` (Task 9) match exactly how Task 10 constructs its inputs (`dateIso`/`paidDateIso` via `.toISOString().slice(0, 10)`, consistent with `toIsoDate`'s UTC-midnight convention since all relevant `DateTime` columns are date-only).

---

Plan complete and saved to `docs/superpowers/plans/2026-09-06-bank-reconciliation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
