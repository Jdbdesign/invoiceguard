# Signup Business Onboarding — Design Spec

Date: 2026-09-05
Status: Approved, pending implementation

## Overview

Phase 2 of the signup redesign (Phase 1 — the visual auth redesign — is merged
and live). This phase adds generalized (non-vertical-specific) business/company
information collection to signup, a post-signup onboarding step, and a welcome
screen. Business name and logo become the primary branding on receipt emails,
replacing the hardcoded "Remitrak" identity, with a "Powered by Remitrak"
attribution line retained.

## Goals

- Collect Business name + Business type as required fields at signup.
- Collect Logo, Business email, Business phone, Country as optional fields in
  a new post-signup step, individually skippable and skippable as a whole.
- Show a welcome/activation screen after that step (whether completed or
  skipped).
- Thread business name + logo into both receipt email templates and the
  Templates preview page, replacing the hardcoded "Remitrak" sender identity,
  while keeping a "Powered by Remitrak" attribution line.
- Make all of this editable later via Settings.
- Never break existing accounts or their receipts.

## Non-goals (explicitly out of scope for this pass)

- Changing the reminder email sign-off ("The Remitrak team" stays as-is —
  reminders are AI-drafted collections copy that intentionally frames
  Remitrak as a neutral third-party voice; changing that is a separate
  product decision).
- Auto-opening the "add client"/"add invoice" modals via a `?new=1` query
  param from the welcome checklist — links go to the existing pages instead.
- Any multi-location / multi-business-profile support — one business profile
  per account, living on the existing 1:1 `Settings` row.

## Schema

Extend the existing `Settings` model (already 1:1 with `User`, already fetched
at every point business identity is needed — see "Receipt template
threading" below) rather than introducing a new model. All new columns
nullable; required-ness for `businessName`/`businessType` at signup is
enforced in the `/api/signup` route, not the database.

```prisma
model Settings {
  // ...existing fields unchanged...
  businessName          String?
  businessType          String?
  logoUrl               String?
  businessEmail         String?
  businessPhone         String?
  country               String?
  onboardingCompletedAt DateTime?
}
```

Migration SQL (additive only):

```sql
ALTER TABLE "Settings"
  ADD COLUMN "businessName" TEXT,
  ADD COLUMN "businessType" TEXT,
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "businessEmail" TEXT,
  ADD COLUMN "businessPhone" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
```

`businessType` is a plain string validated at the API layer against a fixed
app-level list (same pattern `activeReceiptTemplateId` already uses against
`RECEIPT_TEMPLATES`), not a Postgres enum:

```
Freelancer/Consultant, Agency/Studio, School/Education,
Real Estate/Property, Retail/Trade, Contractor/Services,
Healthcare, Other
```

`onboardingCompletedAt` is set (to "now") whether the business-info step is
completed or skipped — a single flag is enough; it only gates whether
`/onboarding/business` is shown again on a later login mid-flow. The
welcome screen's "add a logo later" nudge is driven independently by
`logoUrl == null`, not by this flag.

### Migration workflow

1. Run the guarded dev migration (`npm run db:migrate`) against the dev
   database to generate
   `prisma/migrations/<timestamp>_add_business_profile_fields/migration.sql`.
   **Show the generated SQL to the user before it's applied anywhere.**
2. Add `prisma/apply-prod-add-business-profile-migration.ts`, modeled
   directly on `prisma/apply-prod-active-receipt-template-migration.ts`:
   production host assertion, idempotency check (column-exists +
   `_prisma_migrations` check), baseline row counts before/after, SQL read
   verbatim from the migration file and executed in one transaction,
   post-verify that no row counts changed.
3. The user runs the prod script manually when ready — not run by Claude.

## Signup flow changes

### `src/app/signup/page.tsx`

Add two fields after the password fields, before the submit button:

- Business name — text input, `authInputClass`.
- Business type — `<select>` over the fixed list above, using a new
  `authSelectClass` export (no select variant of the auth input style exists
  yet).

Both required; submit stays disabled until both are non-empty, same pattern
as the existing email/password disablement.

On successful signup, instead of `router.push("/")`, push to
`/onboarding/business` — the signup route no longer sends the user straight
to the dashboard.

### `src/components/auth/AuthLayout.tsx`

Add `authSelectClass`, matching `authInputClass`'s dark styling
(`#131313` background, `#2C2C2C` border, `#007ACC` focus ring) but with the
native select chevron affordance.

### `src/app/api/signup/route.ts`

- Validate `businessName` (non-empty trimmed string) and `businessType`
  (must match the fixed list) alongside existing email/password validation.
- Pass both into the nested `settings: { create: { ... } }` call alongside
  the existing reminder-day defaults.

## Onboarding step — `/onboarding/business`

New route, new page. Layout: simple single-column centered card (dark theme,
same input tokens as the auth pages) — deliberately **not** `AuthLayout`'s
two-pane carousel layout, since this isn't a first-touch acquisition moment.

Fields, all optional:
- Logo — upload control with a circular preview; shows an initial-letter
  badge (business name's first letter) as a placeholder before any upload.
- Business email — `type="email"` text input.
- Business phone — `type="tel"` text input.
- Country — `<select>` over a small hardcoded country list (no external
  package).

Two actions:
- **Continue** — always enabled; saves whatever fields are filled (a PATCH
  to a new endpoint, see below), sets `onboardingCompletedAt`, navigates to
  `/welcome`.
- **Skip for now** — bypasses the whole step without saving any field,
  still sets `onboardingCompletedAt`, navigates to `/welcome`.

New API surface: extend `PUT /api/settings` to accept `businessEmail`,
`businessPhone`, `country`, `logoUrl`, and `onboardingCompletedAt` (set
server-side to `now()` when the client signals completion/skip — not a
client-supplied timestamp), following the same per-field opt-in pattern the
route already uses for its existing fields.

## Welcome screen — `/welcome`

- Headline: "You're all set, {businessName}".
- 3-item activation checklist, each a clickable row (icon + label +
  chevron):
  - Add your first client → `/clients`
  - Create your first invoice → `/invoices`
  - Pick a receipt template → `/templates`
- Primary "Go to Dashboard" button → `/`.
- If the business-info step was skipped (no `logoUrl` set), a small
  dismissible banner: "Add your logo anytime in Settings" → `/settings`.

## Logo upload subsystem

- New dependency: `@vercel/blob`.
- New route: `src/app/api/upload/logo/route.ts` — a `POST` handler using
  `@vercel/blob`'s server-side `handleUpload`, validating content type
  (images only) and size (propose a 2MB cap) in `onBeforeGenerateToken`.
- Client side: `@vercel/blob/client`'s `upload()` called directly from the
  onboarding page (and later, Settings) — uploads go straight from the
  browser to Blob storage, authorized by the route above; the Next.js
  server never handles raw image bytes.
- Only the resulting public URL is persisted, in `Settings.logoUrl`.

### Vercel-side setup required (user action, walked through when reached)

1. Enable Blob storage on the Vercel project: Storage tab → Create → Blob.
   This auto-injects `BLOB_READ_WRITE_TOKEN` into the project's deployed
   environments.
2. Pull that token down for local dev (`vercel env pull` or manual copy into
   `.env` — current `.env` has only `ANTHROPIC_API_KEY`, `APP_BASE_URL`,
   `APP_PASSWORD`, `AUTH_SECRET`, `DATABASE_URL`; `BLOB_READ_WRITE_TOKEN` is
   not present and upload will not work locally without it).

## Receipt template threading

- `sendReceiptEmail` (`src/lib/email.ts`) gains `businessName`/`logoUrl`
  parameters, sourced from the `settings` object every call site already
  fetches via `getOrCreateSettings()` before calling `sendPaymentReceipt`
  (mark-paid, settle-payment-plan, installments auto-flip, manual
  send-receipt route) — no new query needed anywhere.
- Fallback when `settings.businessName` is null: the current hardcoded
  `"Remitrak"` (existing accounts' receipts are unchanged until they set a
  business name).
- Fallback when `settings.logoUrl` is null: an initial-letter badge from
  `(businessName ?? "Remitrak").charAt(0)`.
- `PaymentReceiptEmailProps` (shared by both templates, in
  `src/emails/PaymentReceiptEmail.tsx` and
  `src/emails/PaymentReceiptIndigoEmail.tsx`) gains optional `logoUrl?: string`.
- **Indigo template**: already renders a colored initial-letter circle
  (`businessName.charAt(0)`, `PaymentReceiptIndigoEmail.tsx:84`) — extend
  that exact slot to render an `<Img src={logoUrl}>` when set, falling back
  to the existing initial-letter circle otherwise.
- **Default/emerald template**: has no logo slot today (just a checkmark
  icon in the banner) — add an equivalent logo-or-initial + business name
  row.
- Both templates: add a small muted "Powered by Remitrak" line in the
  footer, below the existing "This is an automated payment receipt from
  {businessName}" line.
- `src/app/(app)/templates/page.tsx`: currently renders each template's
  hardcoded `sampleProps` (generic "Remitrak" `PreviewProps`) for every
  viewer. Fetch the current user's own settings server-side and merge in
  their real `businessName`/`logoUrl` (falling back to the generic sample
  only when unset), so the preview matches what their clients actually
  receive.

## Settings page changes

New "Business" `Card` section on `src/app/(app)/settings/page.tsx`, matching
the page's existing light/slate visual language (`Card`/`CardHeader`, plain
`.input` class) — **not** the dark auth theme, which is specific to the
auth pages. Fields: business name, business type, logo (reusing the same
upload control as onboarding), business email, business phone, country.
Wired through `AppDataContext` following the exact existing pattern used for
`sendReceiptImmediately`/`activeReceiptTemplateId` (local state + `updateX`
callback + `PUT /api/settings`).

## Backward compatibility

- All new `Settings` columns nullable — no backfill needed, zero migration
  risk.
- Existing accounts never see `/onboarding/business` or `/welcome`
  retroactively — that flow is only entered via the signup page's
  post-signup redirect, never via login. Their `onboardingCompletedAt` stays
  null forever, which nothing outside the signup flow reads.
- Receipts for existing accounts look exactly as they do today (hardcoded
  "Remitrak" name, initial-letter badge) until the account owner sets a
  business name via Settings.

## File-level summary (for the implementation plan)

New files:
- `src/app/onboarding/business/page.tsx`
- `src/app/welcome/page.tsx`
- `src/app/api/upload/logo/route.ts`
- `prisma/migrations/<timestamp>_add_business_profile_fields/migration.sql`
- `prisma/apply-prod-add-business-profile-migration.ts`

Changed files:
- `prisma/schema.prisma` (Settings model)
- `src/app/signup/page.tsx`
- `src/app/api/signup/route.ts`
- `src/components/auth/AuthLayout.tsx` (add `authSelectClass`)
- `src/app/api/settings/route.ts` (accept new fields)
- `src/lib/settings.ts` / `src/lib/mappers.ts` / `src/lib/types.ts` (new
  fields on `AppSettings`)
- `src/context/AppDataContext.tsx` (state + update callbacks for new fields)
- `src/app/(app)/settings/page.tsx` (new Business section)
- `src/lib/email.ts` (`sendReceiptEmail` businessName/logoUrl params +
  fallbacks)
- `src/emails/PaymentReceiptEmail.tsx` (logo slot, "Powered by" line)
- `src/emails/PaymentReceiptIndigoEmail.tsx` (logo slot, "Powered by" line)
- `src/app/(app)/templates/page.tsx` (real account branding in preview)
- `package.json` (add `@vercel/blob`)
- `.env` (document `BLOB_READ_WRITE_TOKEN`, not committed with a real value)
