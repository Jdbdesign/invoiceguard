# Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a self-service way to recover a forgotten password via a time-limited, single-use, emailed reset link — replacing the current "developer runs a DB script" recovery path, which isn't viable once real pilot testers are on the app.

**Architecture:** A new `PasswordResetToken` table stores only a sha256 hash of a random 32-byte token (never the raw token) against a `userId`, an `expiresAt` (45 min), and a nullable `usedAt` for single-use enforcement. `POST /api/forgot-password` looks up the email, and — if found — soft-invalidates any of that user's outstanding tokens (sets their `usedAt`) before issuing one fresh token and emailing the raw token as a link via Resend; the endpoint always returns the same generic message regardless of whether the email exists. `GET /api/reset-password?token=` lets the reset page check validity before rendering the form; `POST /api/reset-password` re-validates the token, hashes the new password with the same `bcrypt`/cost-10 scheme signup already uses, updates `User.passwordHash`, and marks the token used — all inside one transaction. Rate limiting is DB-backed (this stack has no Redis): count that user's `PasswordResetToken` rows created in the last 15 minutes, cap at 3, skip issuing (but still return the generic response) past the cap.

**Tech Stack:** Next.js 16.3.2 (App Router, route handlers), React 19.2.8, Prisma 7.9.1 (`@prisma/client` + `@prisma/adapter-pg`, Postgres/Neon), `next-auth@5.0.0-beta.32` (unchanged, reset happens pre-login so no session involved), `bcryptjs` (reused from signup/auth), `resend` (new dependency) for email delivery. No test framework installed — verification is `npx tsc --noEmit`, `npm run lint`, and manual curl/browser testing, matching every prior plan in this repo (multi-tenant-auth, client-invoice-edit-delete, mobile-responsive-fixes).

**Spec:** No separate spec doc — matches this repo's last three plans. This plan is written directly from the user's task description (below) plus a full codebase investigation: confirmed no email-sending capability exists anywhere in the repo today (`send-reminder/route.ts` only writes an `ActivityLog` row, never calls any mail API — the Claude API is used solely for drafting reminder *text*, not sending), confirmed no rate-limiting utility or Redis-like infra exists, read `auth.ts`, `signup/route.ts`, `login/page.tsx`, `signup/page.tsx`, `PasswordInput.tsx`, `PasswordStrengthMeter.tsx`, `prisma/schema.prisma`, `prisma/seed.ts`, and confirmed current Resend Node SDK usage (`resend.emails.send`, `{ data, error }` return shape, `onboarding@resend.dev` test-domain restriction) via Context7 docs.

**Original task description:**
```
Build a standard "Forgot Password" email-based reset flow for InvoiceGuard,
which is live in production with real multi-tenant auth (Auth.js v5,
Credentials provider, JWT sessions) and currently has no self-service
recovery path.

1. "Forgot password?" link on /login -> page to enter email.
2. Backend: secure, single-use, time-limited reset token (~30-60 min),
   stored against the User record (new DB field/table, same migration
   discipline as the auth build).
3. Investigate what actually SENDS email in this codebase before assuming
   anything (the reminder-drafting feature only uses the Claude API for
   drafting text).
4. Reset link -> "Set new password" page, validates token, enforces same
   password rules as signup (reuse PasswordInput + strength meter),
   invalidates token after use.
5. Security: generic "if that email exists..." message either way,
   rate-limit reset requests per email.

Do not merge to master or deploy until reviewed and approved.
```

**Decisions confirmed with the user before writing this plan:**
- Email provider: **Resend**, using `onboarding@resend.dev` as the sender for now. This only permits sending to the Resend account's own email address (`403` otherwise, confirmed via docs) — real pilot testers can't receive these emails until the user verifies a custom domain in Resend, which they're handling separately as a manual step. Every task below is structured to be fully verifiable without a working `RESEND_API_KEY` (see the dev-mode console.log fallback in Task 4), so implementation isn't blocked on it.
- `APP_BASE_URL` is a new env var (doesn't exist in this repo today) used to build the absolute reset link. Defaults to `http://localhost:3000` for local dev (already set in this worktree's `.env`); the user will set it to `https://invoiceguard-eta.vercel.app` in Vercel production env themselves.
- Rate-limiting tradeoff: counting `PasswordResetToken` rows only rate-limits requests against *real* accounts. A burst of requests against nonexistent emails costs a DB lookup each with no side effect (no token created, no email sent) — accepted as fine for pilot stage rather than adding a second attempt-log table.
- Not building: constant-time response normalization between the "email exists" and "email doesn't exist" code paths. The existing login flow (`auth.ts`) has the same class of timing variance today (no dummy bcrypt compare on a missing user) — matching that existing posture rather than introducing new asymmetric rigor. The explicit ask was a generic *message*, which this plan delivers.
- This migration is purely additive (one new table, no changes to existing columns/constraints), so — unlike the multi-tenant-auth migration, which altered existing `NOT NULL` constraints on live data and warranted a separate Neon dev branch — this runs `npm run db:backup` then applies directly against the single shared `DATABASE_URL`. No dev DB branch needed.

## Global Constraints

- Repo root for all paths below: `c:\Users\HP\Downloads\ARAP agentic tool\invoiceguard`
- Work happens in the worktree at `.claude\worktrees\password-reset` on branch `worktree-password-reset` (already created via `EnterWorktree`, dependencies already installed, `.env` already copied with `APP_BASE_URL` and an empty `RESEND_API_KEY` added). Never touch `master` directly. Never merge, push, or deploy until the user has reviewed and approved both this plan's execution and the final diff.
- Follow existing conventions exactly: route handlers use `NextResponse.json(...)`, unauthenticated routes (this entire feature — reset happens before login) skip the `auth()` check that protected routes use, Tailwind utility classes matching `login/page.tsx` and `signup/page.tsx` exactly (same card/input/button classes, same header logo SVG), `@/` path alias to `src/`.
- Password rule: reuse the exact `MIN_PASSWORD_LENGTH = 8` constant pattern from `src/app/api/signup/route.ts` and the same `bcrypt.hash(password, 10)` call.
- No test framework installed. Verification per task is `npx tsc --noEmit` plus the manual curl/browser steps listed in each task. Task 2's library-level verification uses a throwaway, uncommitted `tsx` script against a uniquely-named test user that it deletes in a `finally` block — this is the **shared production database**, so any verification script MUST clean up the rows it creates.
- The seeded dev account (`dev@invoiceguard.local` / `dev-only-password`, from `prisma/seed.ts`) is safe to use for full end-to-end reset-flow testing in Task 9. Since that test changes its password, re-run `npm run db:seed` afterward to restore it to the known seed state.
- `RESEND_API_KEY` is empty in `.env` right now. Every task through Task 9 must pass without it. Task 10 is the only task that needs it — do not ask the user for it until Task 9 is done; when you reach Task 10, stop and ask.

---

### Task 1: Schema — add `PasswordResetToken`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `PasswordResetToken` model (`id`, `userId`, `tokenHash` unique, `createdAt`, `expiresAt`, `usedAt` nullable), `User.passwordResetTokens PasswordResetToken[]` relation. Consumed by Task 2's `src/lib/passwordReset.ts`.

- [ ] **Step 1: Add the model and relation in `prisma/schema.prisma`**

Add this model (place it after the `User` model):

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  createdAt DateTime  @default(now())
  expiresAt DateTime
  usedAt    DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

And add the back-relation on `User` (it currently ends with `settings Settings?`):

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  clients             Client[]
  settings            Settings?
  passwordResetTokens PasswordResetToken[]
}
```

- [ ] **Step 2: Back up the database, then run the migration**

```bash
npm run db:backup
npm run db:migrate -- --name add_password_reset_token
```

Expected: `db:backup` writes `backup-<timestamp>.json` in the worktree root and prints row counts. The migrate command prompts nothing destructive (this is a pure `CREATE TABLE` + FK + index, no column changes to existing tables) and prints `Your database is now in sync with your schema.` A new folder appears under `prisma/migrations/` named `<timestamp>_add_password_reset_token`.

- [ ] **Step 3: Verify Prisma Client picked up the new model**

```bash
npx tsc --noEmit
```

Expected: no errors mentioning `PasswordResetToken` or `Property 'passwordResetToken' does not exist` (there's no application code referencing it yet, so this should simply pass or show unrelated pre-existing state — confirm no new errors appeared).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(password-reset): add PasswordResetToken table"
```

Do NOT commit the `backup-*.json` file — it contains real client/invoice data. Confirm it's untracked (`.gitignore` should already exclude it, matching how the auth migration's backup was handled; if `git status` shows it as untracked-and-about-to-be-added, leave it out of the `git add`).

---

### Task 2: Token library — `src/lib/passwordReset.ts`

**Files:**
- Create: `src/lib/passwordReset.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db` (see `src/lib/db.ts`), the `PasswordResetToken`/`User` models from Task 1.
- Produces:
  - `issuePasswordResetToken(userId: string): Promise<{ rawToken: string } | { rateLimited: true }>`
  - `validatePasswordResetToken(rawToken: string): Promise<{ valid: true; userId: string } | { valid: false }>`
  - `consumePasswordResetToken(rawToken: string, newPasswordHash: string): Promise<{ ok: true } | { ok: false }>`

  These three are consumed directly by Task 4 (`issuePasswordResetToken`) and Task 5 (`validatePasswordResetToken`, `consumePasswordResetToken`).

- [ ] **Step 1: Write `src/lib/passwordReset.ts`**

```ts
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 45 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function issuePasswordResetToken(
  userId: string
): Promise<{ rawToken: string } | { rateLimited: true }> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.passwordResetToken.count({
    where: { userId, createdAt: { gte: windowStart } },
  });
  if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return { rateLimited: true };
  }

  const rawToken = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    }),
  ]);

  return { rawToken };
}

export async function validatePasswordResetToken(
  rawToken: string
): Promise<{ valid: true; userId: string } | { valid: false }> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { valid: false };
  }
  return { valid: true, userId: record.userId };
}

export async function consumePasswordResetToken(
  rawToken: string,
  newPasswordHash: string
): Promise<{ ok: true } | { ok: false }> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false };
  }

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash },
    }),
  ]);

  return { ok: true };
}
```

- [ ] **Step 2: Verify with a throwaway script against a disposable test user**

Create `verify-password-reset-lib.ts` at the worktree root (NOT under `src/`, NOT committed):

```ts
import "dotenv/config";
import { prisma } from "./src/lib/db";
import {
  issuePasswordResetToken,
  validatePasswordResetToken,
  consumePasswordResetToken,
} from "./src/lib/passwordReset";

const RATE_LIMIT_ATTEMPTS = 3;

async function main() {
  const testEmail = `password-reset-verify-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: { email: testEmail, passwordHash: "placeholder" },
  });

  try {
    const issued = await issuePasswordResetToken(user.id);
    if (!("rawToken" in issued)) throw new Error("expected a rawToken, got rate-limited");
    console.log("issued ok");

    const validated = await validatePasswordResetToken(issued.rawToken);
    if (!validated.valid || validated.userId !== user.id) throw new Error("token should validate");
    console.log("validate ok");

    const consumed = await consumePasswordResetToken(issued.rawToken, "new-hash");
    if (!consumed.ok) throw new Error("consume should succeed");
    console.log("consume ok");

    const reused = await validatePasswordResetToken(issued.rawToken);
    if (reused.valid) throw new Error("token must be single-use — reuse should fail");
    console.log("single-use enforcement ok");

    const afterConsume = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (afterConsume.passwordHash !== "new-hash") throw new Error("passwordHash was not updated");
    console.log("passwordHash updated ok");

    for (let i = 0; i < RATE_LIMIT_ATTEMPTS; i++) {
      await issuePasswordResetToken(user.id);
    }
    const rateLimited = await issuePasswordResetToken(user.id);
    if (!("rateLimited" in rateLimited)) throw new Error("expected rate limiting to kick in");
    console.log("rate limiting ok");

    console.log("ALL CHECKS PASSED");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
```

Run:

```bash
npx tsx verify-password-reset-lib.ts
```

Expected: all six `... ok` lines print, then `ALL CHECKS PASSED`, and the script exits 0. The `finally` block deletes the test user regardless of outcome (its `PasswordResetToken` rows cascade-delete via the FK from Task 1).

- [ ] **Step 3: Delete the throwaway script and confirm cleanup**

```bash
rm verify-password-reset-lib.ts
npx tsc --noEmit
```

Expected: `tsc` passes with no new errors. Optionally confirm no orphaned test rows: `npx tsx -e "import {prisma} from './src/lib/db'; prisma.user.count({where:{email:{contains:'password-reset-verify'}}}).then(n=>{console.log(n);process.exit(0)})"` should print `0`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/passwordReset.ts
git commit -m "feat(password-reset): add token issue/validate/consume library"
```

---

### Task 3: Email module — `src/lib/email.ts`

**Files:**
- Create: `src/lib/email.ts`
- Modify: `package.json` (add `resend` dependency)

**Interfaces:**
- Produces: `sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean>`. Consumed by Task 4.

- [ ] **Step 1: Install the Resend SDK**

```bash
npm install resend
```

- [ ] **Step 2: Write `src/lib/email.ts`**

```ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "InvoiceGuard <onboarding@resend.dev>";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject: "Reset your InvoiceGuard password",
      html: `
        <p>We received a request to reset your InvoiceGuard password.</p>
        <p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in 45 minutes.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      console.error("Failed to send password reset email:", error);
      return false;
    }
    return true;
  } catch (err) {
    // Resend's SDK returns { error } for API-level failures (bad/missing key,
    // unverified domain), but network-level failures (DNS, timeout) can still
    // throw. This path must never throw uncaught — forgot-password always
    // returns its generic response regardless of email delivery outcome.
    console.error("Failed to send password reset email (network error):", err);
    return false;
  }
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors. This task does not call the real Resend API (no key yet) — Task 9 will exercise the failure path (empty key → `error` is set → `sendPasswordResetEmail` returns `false` → caller must not crash, verified in Task 4), and Task 10 exercises the real success path once the key is supplied.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email.ts package.json package-lock.json
git commit -m "feat(password-reset): add Resend email module"
```

---

### Task 4: `POST /api/forgot-password`

**Files:**
- Create: `src/app/api/forgot-password/route.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db`), `issuePasswordResetToken` (`@/lib/passwordReset`, Task 2), `sendPasswordResetEmail` (`@/lib/email`, Task 3).
- Produces: `POST /api/forgot-password` accepting `{ email: string }`, always responding `200 { message: string }`.

- [ ] **Step 1: Write `src/app/api/forgot-password/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { issuePasswordResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_MESSAGE = "If that email exists, we've sent a reset link.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const result = await issuePasswordResetToken(user.id);
  if ("rateLimited" in result) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${result.rawToken}`;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] Password reset link for ${email}: ${resetUrl}`);
  }

  await sendPasswordResetEmail(email, resetUrl);

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
```

- [ ] **Step 2: Verify via curl against the dev server (no `RESEND_API_KEY` needed)**

```bash
npm run dev
```

In another terminal, once the server is up:

```bash
curl -s -X POST http://localhost:3000/api/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@invoiceguard.local"}'
```

Expected: `{"message":"If that email exists, we've sent a reset link."}`. In the `npm run dev` terminal, a `[dev] Password reset link for dev@invoiceguard.local: http://localhost:3000/reset-password?token=<64 hex chars>` line should print (email send itself will fail server-side since `RESEND_API_KEY` is empty — confirm a `Failed to send password reset email:` line also prints, and confirm the request still returned `200` with the generic message despite that failure).

Then test the enumeration-safety and rate-limit paths:

```bash
curl -s -X POST http://localhost:3000/api/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody-real@example.com"}'
```

Expected: identical `{"message":"..."}` response, same shape, same status code.

```bash
for i in 1 2 3 4; do curl -s -X POST http://localhost:3000/api/forgot-password -H "Content-Type: application/json" -d '{"email":"dev@invoiceguard.local"}'; echo; done
```

Expected: all four calls return the same `200` generic message, but only the first 3 produce a new `[dev] Password reset link for ...` line in the server log (the 4th is rate-limited and silently skips issuing/logging, per the design — same generic response either way).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/forgot-password
git commit -m "feat(password-reset): add POST /api/forgot-password"
```

---

### Task 5: `GET`/`POST /api/reset-password`

**Files:**
- Create: `src/app/api/reset-password/route.ts`

**Interfaces:**
- Consumes: `validatePasswordResetToken`, `consumePasswordResetToken` (`@/lib/passwordReset`, Task 2), `bcrypt` (`bcryptjs`, already a dependency).
- Produces: `GET /api/reset-password?token=` → `{ valid: boolean }`; `POST /api/reset-password` accepting `{ token: string; password: string }` → `200 { ok: true }` or `400 { error: string }`. Consumed by Task 7's page.

- [ ] **Step 1: Write `src/app/api/reset-password/route.ts`**

```ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { validatePasswordResetToken, consumePasswordResetToken } from "@/lib/passwordReset";

const MIN_PASSWORD_LENGTH = 8;

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ valid: false });
  }
  const result = await validatePasswordResetToken(token);
  return NextResponse.json({ valid: result.valid });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!token) {
    return NextResponse.json({ error: "missing reset token" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await consumePasswordResetToken(token, passwordHash);
  if (!result.ok) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify via curl (dev server still running from Task 4)**

Get a fresh token first (reuses the dev-mode log line from Task 4):

```bash
curl -s -X POST http://localhost:3000/api/forgot-password -H "Content-Type: application/json" -d '{"email":"dev@invoiceguard.local"}' > /dev/null
```

Copy the token out of the `[dev] Password reset link for ...` line in the `npm run dev` terminal, then:

```bash
curl -s "http://localhost:3000/api/reset-password?token=<paste token>"
```

Expected: `{"valid":true}`.

```bash
curl -s "http://localhost:3000/api/reset-password?token=not-a-real-token"
```

Expected: `{"valid":false}`.

```bash
curl -s -X POST http://localhost:3000/api/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<paste same token>","password":"newtestpassword123"}'
```

Expected: `{"ok":true}`.

```bash
curl -s -X POST http://localhost:3000/api/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<paste same token again>","password":"anotherpassword123"}'
```

Expected: `400 {"error":"This reset link is invalid or has expired."}` — proves single-use.

Restore the seed account's known password before moving on:

```bash
npm run db:seed
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reset-password
git commit -m "feat(password-reset): add GET/POST /api/reset-password"
```

---

### Task 6: `/forgot-password` page

**Files:**
- Create: `src/app/forgot-password/page.tsx`

**Interfaces:**
- Consumes: `POST /api/forgot-password` (Task 4).

- [ ] **Step 1: Write `src/app/forgot-password/page.tsx`**

```tsx
"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" strokeWidth={2}>
              <path
                d="M12 2.5l7.5 3.2v5.4c0 5-3.2 8.9-7.5 10.4-4.3-1.5-7.5-5.4-7.5-10.4V5.7L12 2.5z"
                stroke="currentColor"
                strokeLinejoin="round"
              />
              <path
                d="M9 12.2l2.1 2.1L15.3 10"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">InvoiceGuard</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 shadow-xl shadow-black/20">
          {submitted ? (
            <p className="text-sm text-slate-300">
              If that email exists, we&apos;ve sent a reset link. Check your inbox.
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
              <input
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={submitting || !email}
                className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-slate-500">
            <a href="/login" className="font-medium text-blue-400 hover:text-blue-300">
              Back to login
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in the browser**

With `npm run dev` still running, open `http://localhost:3000/forgot-password`. Enter `dev@invoiceguard.local`, submit. Expected: the form is replaced by "If that email exists, we've sent a reset link. Check your inbox." and the `[dev] Password reset link for ...` line appears in the server log.

```bash
npx tsc --noEmit && npm run lint
```

Expected: both pass with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/forgot-password
git commit -m "feat(password-reset): add /forgot-password page"
```

---

### Task 7: `/reset-password` page

**Files:**
- Create: `src/app/reset-password/page.tsx`

**Interfaces:**
- Consumes: `GET`/`POST /api/reset-password` (Task 5), `PasswordInput` (`@/components/ui/PasswordInput`), `PasswordStrengthMeter` (`@/components/ui/PasswordStrengthMeter`).

- [ ] **Step 1: Write `src/app/reset-password/page.tsx`**

```tsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

type TokenStatus = "checking" | "valid" | "invalid";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  useEffect(() => {
    if (!token) {
      setTokenStatus("invalid");
      return;
    }
    fetch(`/api/reset-password?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => setTokenStatus(data.valid ? "valid" : "invalid"))
      .catch(() => setTokenStatus("invalid"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const passwordValue = passwordRef.current?.value || password;
    const confirmPasswordValue = confirmPasswordRef.current?.value || confirmPassword;

    if (passwordValue !== confirmPasswordValue) {
      setConfirmTouched(true);
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: passwordValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" strokeWidth={2}>
              <path
                d="M12 2.5l7.5 3.2v5.4c0 5-3.2 8.9-7.5 10.4-4.3-1.5-7.5-5.4-7.5-10.4V5.7L12 2.5z"
                stroke="currentColor"
                strokeLinejoin="round"
              />
              <path
                d="M9 12.2l2.1 2.1L15.3 10"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">InvoiceGuard</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 shadow-xl shadow-black/20">
          {tokenStatus === "checking" && (
            <p className="text-sm text-slate-400">Checking your reset link…</p>
          )}

          {tokenStatus === "invalid" && (
            <div>
              <p className="text-sm text-slate-300">This reset link is invalid or has expired.</p>
              <a
                href="/forgot-password"
                className="mt-3 inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Request a new link
              </a>
            </div>
          )}

          {tokenStatus === "valid" && done && (
            <div>
              <p className="text-sm text-slate-300">Your password has been reset.</p>
              <a
                href="/login"
                className="mt-3 inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Back to login
              </a>
            </div>
          )}

          {tokenStatus === "valid" && !done && (
            <form onSubmit={handleSubmit}>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">New password</label>
              <PasswordInput
                ref={passwordRef}
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                autoFocus
              />
              <PasswordStrengthMeter password={password} />

              <label className="mb-1.5 mt-4 block text-xs font-medium text-slate-400">
                Confirm password
              </label>
              <PasswordInput
                ref={confirmPasswordRef}
                value={confirmPassword}
                onChange={setConfirmPassword}
                onBlur={() => setConfirmTouched(true)}
                placeholder="Re-enter password"
                aria-invalid={confirmTouched && passwordsMismatch}
                autoComplete="new-password"
              />
              {confirmTouched && passwordsMismatch && (
                <p className="mt-1.5 text-xs font-medium text-rose-400">Passwords don&apos;t match.</p>
              )}

              {error && <p className="mt-2.5 text-xs font-medium text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting || password.length === 0 || passwordsMismatch}
                className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Resetting…" : "Reset password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in the browser**

With `npm run dev` running, `POST` to `/api/forgot-password` for `dev@invoiceguard.local` (via the `/forgot-password` page from Task 6), copy the token out of the server log's reset URL, and visit `http://localhost:3000/reset-password?token=<token>` directly. Expected: form renders (token valid), mismatched confirm-password shows the inline error and disables submit, entering matching 8+ char passwords and submitting shows "Your password has been reset." Then visit the same URL again (same token) — expected: "This reset link is invalid or has expired." (single-use). Visit `http://localhost:3000/reset-password` with no token — expected: "This reset link is invalid or has expired." immediately.

Restore seed state:

```bash
npm run db:seed
```

```bash
npx tsc --noEmit && npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/reset-password
git commit -m "feat(password-reset): add /reset-password page"
```

---

### Task 8: "Forgot password?" link on `/login`

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Add the link**

In `LoginForm`, right after the `PasswordInput` block and before the `{error && ...}` line, add:

```tsx
          <PasswordInput
            ref={passwordRef}
            value={password}
            onChange={setPassword}
            placeholder="Enter password"
            autoComplete="current-password"
          />
          <div className="mt-1.5 text-right">
            <a href="/forgot-password" className="text-xs font-medium text-blue-400 hover:text-blue-300">
              Forgot password?
            </a>
          </div>

          {error && <p className="mt-2.5 text-xs font-medium text-red-400">{error}</p>}
```

(Only the new `<div>` block is an addition — the surrounding `PasswordInput` and `{error && ...}` lines already exist in the file and are shown here for placement context.)

- [ ] **Step 2: Verify in the browser**

Visit `http://localhost:3000/login`. Expected: a right-aligned "Forgot password?" link appears under the password field, and clicking it navigates to `/forgot-password`.

```bash
npx tsc --noEmit && npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(password-reset): add forgot-password link to login page"
```

---

### Task 9: Full end-to-end verification (no real email required)

**Files:** none (verification only).

- [ ] **Step 1: Walk the full flow in the browser**

With `npm run dev` running:
1. Go to `/login`, click "Forgot password?" → lands on `/forgot-password`.
2. Submit `dev@invoiceguard.local` → generic confirmation message shown.
3. Copy the reset URL from the `[dev] Password reset link for ...` server log line, open it.
4. Set a new password (e.g. `e2e-test-password-123`), submit → "Your password has been reset."
5. Go to `/login`, sign in with `dev@invoiceguard.local` / `e2e-test-password-123` → succeeds, lands on the app.
6. Sign out, go back to the same reset URL from step 3 → "This reset link is invalid or has expired." (proves single-use held even across a successful login).

- [ ] **Step 2: Restore seed state**

```bash
npm run db:seed
```

Expected: `dev@invoiceguard.local` / `dev-only-password` works again on `/login`.

- [ ] **Step 3: Full verification sweep**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all three succeed with no errors.

- [ ] **Step 4: Report to the user**

Summarize Task 9's results (all steps passed / anything that didn't) and stop here. Do not proceed to Task 10 without the user's go-ahead — it needs their `RESEND_API_KEY`.

---

### Task 10: Real email delivery (gated on `RESEND_API_KEY`)

**Files:**
- Modify: `.env` (this worktree only — never commit `.env`)

**This task requires stopping and asking the user for their `RESEND_API_KEY`** — per their explicit instruction, do not proceed past Task 9 without asking first.

- [ ] **Step 1: Ask the user for the key, add it to `.env`**

Set `RESEND_API_KEY=<value they provide>` in this worktree's `.env`. Restart `npm run dev` so the new env var loads.

- [ ] **Step 2: Trigger a real send and confirm delivery**

```bash
curl -s -X POST http://localhost:3000/api/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"<the Resend account owner'"'"'s own email address>"}'
```

Expected: `{"message":"..."}` as before, but this time no `Failed to send password reset email:` line appears in the server log, and the user confirms in Resend's dashboard (or their inbox) that the email arrived with a working reset link, and that the linked page correctly resets the password end-to-end.

- [ ] **Step 3: Report results to the user and stop**

Do not merge to `master`, push, or deploy. Report Task 10's outcome and wait for the user's review and explicit approval before any of those happen.
