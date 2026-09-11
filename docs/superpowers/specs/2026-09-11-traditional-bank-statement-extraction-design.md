# Traditional (Non-AI) Bank Statement Extraction — Design

**Goal:** Add a second, user-selectable extraction path for bank statement uploads — a regex/pattern-based parser tuned to the OWealth/GTBank-style statement format we have real samples of — alongside the existing Claude-based extractor. Best-effort, not guaranteed-accurate; some cases are genuinely unresolvable without semantic understanding and that's expected.

**Non-goals:** Not replacing the AI path (it stays the default). Not modeling sub-accounts/wallets. Not adding any `BankStatementUpload`/`BankTransaction` schema changes. Not building a general-purpose bank-statement-format engine — this parser targets the one format we have real evidence for.

## Background: the source format

Verified against the real `OLAYINKA ISAIAH JACOBS` statement PDF via the app's own `pdf-parse` pipeline. The extracted text is two account ledgers ("Wallet Account", "Savings Account") concatenated, each with a summary block (`Credit Count`, `Total Credit`, `Closing Balance`, `Debit Count`, `Total Debit`, `Opening Balance`, `Period: ...`), a header row, then transaction rows.

Every transaction row starts with a distinctive, unambiguous anchor: `DD Mon YYYY HH:MM:SS DD Mon YYYY` (Trans. Time immediately followed by Value Date). No summary line, header row, or page-break marker (`-- N of 7 --`) matches this shape. `pdf-parse` wraps individual rows across 1-4 lines unpredictably (long descriptions and reference numbers wrap; reference numbers occasionally split mid-digit-string across a line break with no separator).

**Known duplicate case:** "OWealth Withdrawal(Transaction Payment)" and "Auto-save to OWealth Balance" rows represent transfers between the customer's own Wallet and Savings/OWealth sub-accounts. The same transaction reference number appears once in each ledger with opposite signs (e.g. ref `260807010201496141065410`: +27,000 in the Wallet ledger, -27,000 in the Savings ledger) — both occurrences are fully well-formed with explicit signs. There's no principled way to pick one, since this app has no sub-account concept (one flat transaction list per upload).

## 1. Extraction algorithm (`src/lib/traditionalBankStatementExtraction.ts`)

Pure function, no network calls:

```ts
export interface TraditionalExtractionResult {
  rows: ParsedStatementRow[];
  lowConfidenceReasons: string[];
}

export function extractTraditional(statementText: string): TraditionalExtractionResult
```

`ParsedStatementRow` (in `src/lib/bankStatementExtraction.ts`) gains two optional fields, additive only — the AI path never sets them:

```ts
export interface ParsedStatementRow {
  date: string;
  description: string;
  amount: number;
  needsReview?: boolean;
  reviewReason?: string;
}
```

**Chunking:** find all anchor matches of `/\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \d{2} \w{3} \d{4}/g` in the whitespace-normalized text (newlines collapsed to spaces first, since row wrapping carries no semantic meaning). Slice the text between consecutive anchors — each slice is one transaction's raw chunk. This skips all non-transaction text (summaries, headers, page markers) automatically, since only real transaction rows match the anchor shape.

**Per-chunk parsing**, in order after the anchor's second date:
1. Locate the first two monetary tokens matching `--|[\d,]+\.\d{2}` — these are Debit then Credit, in that fixed column order. Description = the text between the anchor and the first monetary token, trimmed. Whichever of the two tokens isn't `--` gives the magnitude; Debit → negative amount, Credit → positive amount. (A row with both tokens `--` or both non-`--` is malformed — drop it, don't guess.)
2. Extract the trailing reference number: the last contiguous digit-run(s) in the chunk after the Balance-After token, concatenating adjacent digit-run fragments (handles the line-wrap-mid-reference case) into one string. Used only for dedup, never stored on `ParsedStatementRow`.
3. Normalize the anchor's Value Date (`DD Mon YYYY`) to `YYYY-MM-DD`.

**Duplicate-reference handling:** after all chunks are parsed, group rows by reference number. Where a reference appears more than once:
- If all occurrences agree on sign and amount, dedup silently (keep one) — this happens for genuine incidental duplication, not the ambiguous case.
- If occurrences disagree (opposite sign, and/or different amount), keep **all** occurrences, each with `needsReview: true` and `reviewReason: "Same reference (<ref>) appears elsewhere in the statement with a conflicting amount/sign — couldn't determine which is correct."` This is a deliberate never-guess policy per the known OWealth-transfer case.

## 2. Confidence check

Computed alongside extraction, returned as `lowConfidenceReasons: string[]` (empty = confident):

- **Zero rows extracted** — the route already rejects scanned/image PDFs via `looksLikeScannedPdf` before extraction runs, so a text-bearing statement reaching this stage with zero parsed rows means the format wasn't recognized → `"No transactions could be parsed from this statement."`
- **Needs-review rows present** → `` `${count} transaction(s) have a conflicting duplicate elsewhere in the statement and need manual review.` ``
- **Declared-count mismatch**: for each `Credit Count` / `Debit Count` summary block found in the text (`/Credit Count\s+(\d+)/`, `/Debit Count\s+(\d+)/`), compare against the count of positive/negative rows actually extracted from that same section of text (bounded by the next summary block or end of text). Mismatch → `` `Extracted row counts don't match this statement's own declared totals (expected ${expected}, got ${actual}) — some rows may be missing or miscounted.` ``

`lowConfidenceReasons` is **not persisted** — it's returned in the `POST /api/bank-statements` response only, since "retry with AI" is only a meaningful action right at upload time, before the user has started reviewing. Once in the review step, the per-row `needsReview` flag (already in `parsedRowsJson`) is the carrier of ambiguity signal, and it does **not** persist onto `BankTransaction` once confirmed — confirming a row is the user's explicit sign-off, matching this codebase's existing convention of not storing extraction metadata on `BankTransaction`.

## 3. Settings — data model & API

Add to `Settings` in `prisma/schema.prisma` (plain `String`, not a Prisma enum, per this schema's existing convention — see `Global Constraints` in the bank-reconciliation spec):

```prisma
bankStatementExtractionMethod String @default("ai")
```

Values: `"ai" | "traditional"`. Additive column with a default — same idempotent-migration pattern as this repo's other `apply-prod-*` scripts (e.g. `apply-prod-active-receipt-template-migration.ts`), adapted for `columnExists` idempotency.

`src/app/api/settings/route.ts` PUT: validate `body.bankStatementExtractionMethod` against the two known values, same pattern as the existing `activeReceiptTemplateId` validation.

`src/lib/mappers.ts` `mapSettings`: pass the field through.

`src/context/AppDataContext.tsx`: add `bankStatementExtractionMethod` state + `updateBankStatementExtractionMethod(method)`, mirroring `sendReceiptImmediately`/`updateSendReceiptImmediately` exactly.

## 4. Settings UI

New card on `src/app/(app)/settings/page.tsx`, placed after "Payment receipts", using the identical two-option button-card pattern already there:

- **"AI-powered (recommended)"** — "Uses Claude to read and structure your statement. Handles unusual formats and layout variations."
- **"Traditional (faster, no AI cost, less reliable)"** — "Uses pattern matching instead of AI. Faster and free, but may misread unusual formats or ambiguous transactions."

## 5. Upload flow — routing & UI

`src/app/api/bank-statements/route.ts`: after loading the session, fetch `getOrCreateSettings(session.user.id)`. Branch:
- `"traditional"` → `extractTraditional(extractedText)`, capture `lowConfidenceReasons`.
- `"ai"` (default) → existing `extractTransactionsFromStatementText(extractedText)`, unchanged.

Response shape gains an optional field: `{ upload, rows, lowConfidenceReasons? }`.

`src/app/(app)/reconciliation/UploadStatementButton.tsx`:
- Persistent amber warning banner (reusing the existing `border-amber-200 bg-amber-50 text-amber-800` style from the Settings page) shown whenever the owner's setting is `"traditional"` — wording close to: *"Using traditional extraction. This method may misread transactions, especially with unusual formats or ambiguous data — please review the parsed results carefully before confirming."*
- After upload, if `lowConfidenceReasons.length > 0`, show a toast (or inline banner) listing the reasons plus a "Retry with AI extraction" button that re-POSTs the same `fileUrl`/`fileName` forcing the AI path for this one upload (a one-off override, not a settings change) — e.g. an optional `forceMethod: "ai"` body field the route honors for this single request.

## 6. Review UI

`src/app/(app)/reconciliation/[uploadId]/review/ReviewRowsEditor.tsx`: extend the local `Row` type with optional `needsReview?: boolean; reviewReason?: string`, and render a small warning badge/tooltip on flagged rows (reusing the existing `Badge` component, `warning` variant). Flags are display-only — the PATCH `/api/bank-statements/[id]` body continues to send `{ rows }` in the current shape; `needsReview`/`reviewReason` are simply not included in what's submitted, so they never reach `BankTransaction`.

## 7. Testing

Pure-logic vitest coverage for `traditionalBankStatementExtraction.ts`, consistent with this codebase's existing test conventions (mappers, pdfValidation, the Claude-response parser):
- A clean synthetic multi-row statement → correct date/description/sign/amount extraction.
- A row wrapped across multiple lines (long description, split reference number) → still parses correctly.
- The real duplicate-reference case (two conflicting occurrences) → both rows returned with `needsReview: true` and a `reviewReason`; a non-conflicting incidental duplicate → deduped silently.
- Declared-count mismatch → correct `lowConfidenceReasons` entry.
- Zero extractable rows → correct `lowConfidenceReasons` entry, empty `rows`.

No changes needed to the existing `bankStatementExtraction.test.ts` (AI path) beyond confirming the two new optional fields don't break existing assertions (they won't — `toEqual` on objects without those keys still matches objects that also lack them).

## Explicitly out of scope

- Sub-account-aware modeling of the Wallet/Savings duplicate (would require a data model change well beyond this feature).
- Auto-fallback to AI on low confidence (would spend AI cost the user explicitly opted out of, without their say).
- Persisting `needsReview` onto `BankTransaction`.
- Supporting bank statement formats other than the OWealth/GTBank-style one we have real samples of.
