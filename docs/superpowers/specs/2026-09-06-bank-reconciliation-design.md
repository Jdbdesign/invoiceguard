# Bank Reconciliation (Payment-to-Deposit Matching) — Design Spec

Date: 2026-09-06
Status: Approved, pending implementation

## Overview

A new "Reconciliation" feature: users upload a bank statement PDF, the app
parses it into transaction rows, and those rows get matched against payments
already recorded in the app (invoice mark-paid, payment-plan settlement,
individual installment payments). Output is three buckets — Matched,
Unmatched-on-our-side, Unmatched-on-bank-side — with manual override for
anything the automatic match misses.

Live bank linking (Plaid) is explicitly out of scope for v1 (planned v2).
OCR/scanned-PDF support is explicitly out of scope for v1 — statements with
no extractable text layer are rejected with a clear message; if real users
hit that wall often, OCR gets added later as a fallback, not built
preemptively.

## Why this needed a new `Payment` model

The existing schema has no structured payment record. Marking a
non-payment-plan invoice paid (`mark-paid`) is a status flip
(`Invoice.status`, `Invoice.balance`) plus a free-text `ActivityLog` row;
only `Installment` carries real `amount`/`paidDate` fields, and only for
invoices on a payment plan. Reconciliation needs one consistent table of
"amount + date the app believes was paid" to match against — reverse-
engineering that from `ActivityLog` message text and `Invoice` status was
rejected as a foundation. So this feature also introduces a general-purpose
`Payment` model and threads it through the three places money currently gets
marked received:

- `src/app/api/invoices/[invoiceNumber]/mark-paid/route.ts` (full invoice,
  no payment plan)
- `src/app/api/invoices/[invoiceNumber]/settle-payment-plan/route.ts` (lump-
  sum settlement of all remaining installments)
- `src/app/api/installments/[id]/route.ts` (single installment paid/unpaid
  toggle)

## Schema

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
  status         String    @default("uploaded") // uploaded | parsing | needs_review | failed | reviewed
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
  amount      Float     // positive = credit/deposit, negative = debit
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

Conventions followed (matching every existing model): `cuid()` ids, no
`updatedAt` field, no soft-delete, `status` as plain `String` (not a Prisma
enum), money as `Float`, user-owned top-level resources (`BankStatementUpload`,
`BankTransaction`) carry `ownerId` directly to `User` the same way `Client`,
`Settings`, and `ShareLink` do. The match itself is a plain optional
`Payment.bankTransactionId` FK rather than a separate join table — it's
strictly 1:1, so a join table would be unnecessary structure.

Migration is additive-only (new tables + new nullable/optional columns), so
no backfill is needed and existing data is untouched. Follows the existing
migration workflow (`npm run db:migrate` to generate the migration, a
`prisma/apply-prod-add-bank-reconciliation-migration.ts` script modeled on
`prisma/apply-prod-add-business-profile-migration.ts`, user runs it against
prod manually).

## Payment lifecycle in the three existing routes

- **`mark-paid`**: after flipping `Invoice.status`/`balance`, also create one
  `Payment` row: `amount: invoice.amount`, `paidDate: now`, `installmentId:
  null`.
- **`settle-payment-plan`**: this settles *all* remaining unpaid installments
  in one lump sum (see current code — one `paidDate`, one summed `remaining`
  amount, one activity log entry). Create **one** `Payment` row for the lump
  sum (`amount: remaining`, `installmentId: null`) rather than one per
  installment settled — a single bank deposit is what this action actually
  corresponds to, and per-installment `Payment` rows would never individually
  match a real transaction.
- **`installments/[id]` PATCH (paid branch)**: create one `Payment` row per
  individual installment payment (`amount: installment.amount, paidDate:
  today, installmentId: installment.id`).
- **`installments/[id]` PATCH (unpaid/reversal branch)**: this route already
  supports toggling an installment back to unpaid, reversing the invoice
  balance. The corresponding `Payment` row must be deleted on reversal to
  avoid a stale row remaining matchable. If that `Payment` was already
  reconciled (`reconciledAt` set / linked to a `BankTransaction`), reversal
  is blocked with a 400 ("this installment's payment has already been
  reconciled with a bank transaction — unlink it in Reconciliation before
  reversing") rather than silently orphaning the matched `BankTransaction`.

## PDF parsing pipeline

1. **Upload**: client uploads the PDF via the same direct-to-Vercel-Blob
   pattern as `LogoUploadField.tsx` / `src/app/api/upload/logo/route.ts`, but
   a new route (`src/app/api/upload/bank-statement/route.ts`) with
   `allowedContentTypes: ["application/pdf"]` and a larger size cap
   (proposing 15MB — statements run many pages) in `onBeforeGenerateToken`.
2. **Server-side content re-validation (not just client-trust)** — this is a
   real gap in the existing logo upload (client-side type/size check only,
   nothing re-verified server-side) and must not be repeated here:
   - `onBeforeGenerateToken` still restricts `allowedContentTypes`, but that
     alone only constrains what Vercel Blob's client SDK *declares* — it
     does not prove the bytes are actually a PDF.
   - After the blob upload completes and the server fetches the bytes to run
     `pdf-parse`, it first checks the actual byte signature (a valid PDF
     starts with the `%PDF-` magic bytes). If that check fails, the upload
     is immediately rejected — `BankStatementUpload.status = "failed"`,
     `errorMessage: "This file doesn't appear to be a valid PDF."` — before
     any parsing is attempted.
   - Size is also re-checked server-side against the actual fetched byte
     length, not just trusted from the client.
3. **Text extraction**: `pdf-parse` (new dependency — nothing PDF-related
   exists in the project today) extracts raw text from the validated PDF.
4. **Scanned-PDF guard**: if average extracted characters per page is below
   50 (a real text-based statement page has hundreds of characters at
   minimum; near-zero text on a page is a strong signal of an image-only/
   scanned page), stop and mark `status: "failed"` with `errorMessage: "This
   looks like a scanned or image-based PDF, which isn't supported yet —
   please upload a text-based statement export."` No OCR fallback in v1.
   The 50-char threshold is a starting point, not a validated constant —
   expect to tune it once tested against real statement PDFs rather than
   synthetic ones.
5. **Structuring via Claude**: the extracted text is sent to Claude (reusing
   the existing `@anthropic-ai/sdk` usage pattern in `src/lib/claude.ts`)
   with a prompt to extract every transaction row as
   `{date, description, amount}` JSON (positive = credit/deposit, negative =
   debit), explicitly instructed to ignore headers, footers, page numbers,
   and running-balance-only lines. This absorbs the layout inconsistency
   across different (especially Nigerian) bank statement formats without
   per-bank regex parsers. The whole call — the API request itself (network
   error, rate limit, timeout) as well as parsing its response — is wrapped
   in try/catch; either kind of failure sets `status: "failed"` with a
   generic "couldn't parse this statement, please try again" message rather
   than surfacing a raw exception or leaving the upload stuck in
   `"parsing"`.
6. Parsed rows are stored in `BankStatementUpload.parsedRowsJson`,
   `status` becomes `"needs_review"`, and the rows are returned to the
   client. **Nothing is written to `BankTransaction` yet.**

## Review/correction UI

A page rendering the parsed rows as an editable table (date, description,
amount) — the user can fix a misparsed value, delete a garbage row (e.g. a
stray header/footer line Claude mis-extracted), or add a row Claude missed.
Persisting `parsedRowsJson` server-side (rather than holding it only in
client state) means a page refresh mid-review doesn't lose the parse. On
confirm:
- The (possibly edited) rows are persisted as `BankTransaction` records
  (`position` = row order, `ownerId` = upload owner).
- `BankStatementUpload.status` → `"reviewed"`, `reviewedAt` set.
- The user is taken straight to the reconciliation bucket screen, where
  matching runs against the full set of the user's unmatched data (not just
  this upload — a `Payment` from a prior period should still be matchable
  against a transaction in a newly uploaded statement).

## Matching logic

Computed on demand (no persisted "candidate match" table) each time the
reconciliation screen loads, scoped to the current user:

- Only **positive-amount** `BankTransaction` rows (deposits) that are not
  `ignoredAt` and have no linked `Payment` participate as match candidates.
  Debit rows are parsed and stored (for completeness/audit) but excluded
  from every bucket on the reconciliation screen — a deliberate v1
  simplification, since debits are never the "recorded payment" side of a
  match.
- For each candidate `BankTransaction`, find `Payment` rows where
  `reconciledAt IS NULL`, `amount` matches within a 0.01 epsilon (float
  rounding tolerance, not a business tolerance — this is still an exact-
  amount match), and `paidDate` is within **±3 days** of the transaction's
  date.
- **Exactly one candidate `Payment`** → surfaced as a one-click-confirm
  suggested match ("Matched" bucket, pending confirmation).
- **Multiple candidate `Payment`s** (e.g. two invoices paid the identical
  amount on the same day) → "Needs Review" bucket, showing all candidates
  for the user to pick from (or dismiss as no match).
- **Zero candidates** → "Unmatched — Bank" bucket.
- Any `Payment` with `reconciledAt IS NULL` that never appears as a
  candidate for any transaction → "Unmatched — Ours" bucket.

Deliberately imprecise for v1 (flagged, not accidental): no split/partial
matching (one deposit covering multiple payments, or one payment split
across multiple deposits), no fuzzy amount tolerance (a deposit short by a
bank fee won't auto-match), and transaction description text is shown for
context but never used in match scoring — narration formats are too
inconsistent across banks to score reliably.

## Three-bucket UX

One reconciliation screen with four sections: **Matched**, **Needs Review**,
**Unmatched — Ours**, **Unmatched — Bank**.

- **Matched**: confirm or reject the suggested pairing. Confirming sets
  `Payment.reconciledAt = now()` and `Payment.bankTransactionId`.
- **Needs Review**: pick the correct `Payment` from the candidate list, or
  dismiss (falls through to "Unmatched — Bank").
- **Unmatched — Ours** / **Unmatched — Bank**: "Link manually" opens a
  search picker over the other side (searchable by amount, client name, or
  invoice number) for cases outside the ±3-day/exact-amount window (e.g. a
  bank fee shaved off the deposit). Manually confirming a link uses the same
  write-back as an automatic match.
- **Unmatched — Bank** only: "Ignore" sets `BankTransaction.ignoredAt` for
  transactions that will never correspond to an invoice payment (bank fees,
  unrelated transfers), removing them from the bucket without a fake match.

## Nav placement

New "Reconciliation" item in `src/components/layout/Sidebar.tsx`'s
`NAV_ITEMS`, positioned between Invoices and Templates (financial-workflow
ordering: Clients → Invoices → Reconciliation → Templates → Settings), with
its own inline SVG icon following the existing 24x24 viewBox /
`strokeWidth={1.8}` / `stroke="currentColor"` pattern.

## Backward compatibility

- All new tables are additive; no existing table's required columns change.
- `Payment` only starts being created going forward from routes touched by
  this feature — no backfill of historical mark-paid/installment events into
  `Payment`. This means bank statements covering periods before this
  feature ships will show those older payments as unmatchable (they simply
  won't exist as `Payment` rows), which is expected and acceptable for v1 —
  reconciliation is inherently a going-forward tool at launch.
- No existing route's response shape changes for existing callers; the three
  payment-recording routes gain a side-effect (`Payment` row creation) but
  keep their existing request/response contracts.

## File-level summary (for the implementation plan)

New files:
- `src/app/(app)/reconciliation/page.tsx` (upload list + three-bucket screen,
  likely split into sub-components)
- `src/app/(app)/reconciliation/[uploadId]/review/page.tsx` (parsed-rows
  review/correction step)
- `src/app/api/upload/bank-statement/route.ts`
- `src/app/api/bank-statements/route.ts` (create upload record, run parse
  pipeline)
- `src/app/api/bank-statements/[id]/route.ts` (confirm reviewed rows →
  materialize `BankTransaction`s)
- `src/app/api/reconciliation/matches/route.ts` — `GET` computes and returns
  the four buckets; `POST` (body `{ paymentId, bankTransactionId }`) confirms
  a match (used identically for accepting a suggested match, picking a
  Needs-Review candidate, and manual linking)
- `src/app/api/reconciliation/matches/[paymentId]/route.ts` — `DELETE`
  unlinks/rejects a match, clearing `Payment.reconciledAt` and
  `bankTransactionId`
- `src/app/api/reconciliation/transactions/[transactionId]/route.ts` —
  `PATCH` (body `{ ignored: true }`) sets `BankTransaction.ignoredAt`
- `src/lib/bankStatementParsing.ts` (pdf-parse + Claude structuring pipeline)
- `src/lib/reconciliationMatching.ts` (matching algorithm)
- `prisma/migrations/<timestamp>_add_bank_reconciliation/migration.sql`
- `prisma/apply-prod-add-bank-reconciliation-migration.ts`

Changed files:
- `prisma/schema.prisma` (new `Payment`, `BankStatementUpload`,
  `BankTransaction` models)
- `src/app/api/invoices/[invoiceNumber]/mark-paid/route.ts` (create
  `Payment`)
- `src/app/api/invoices/[invoiceNumber]/settle-payment-plan/route.ts`
  (create one lump-sum `Payment`)
- `src/app/api/installments/[id]/route.ts` (create `Payment` on paid branch;
  delete-or-block on unpaid/reversal branch)
- `src/components/layout/Sidebar.tsx` (new nav item + icon)
- `package.json` (add `pdf-parse`)
