This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Environment Variables

Set these wherever the app runs (local `.env`, Vercel Project Settings → Environment Variables):

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (e.g. from Neon). Used by Prisma for both migrations and the runtime client. |
| `ANTHROPIC_API_KEY` | Claude API key, used to draft reminder emails. |
| `AUTH_SECRET` | Signing secret for Auth.js session JWTs. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep it private. |
| `APP_BASE_URL` | Absolute base URL used to build password-reset and client share links (e.g. `https://app.remitrak.com`). Falls back to `http://localhost:3000` outside production; must be set explicitly in production or reset/share links will fail to send (see `src/app/api/forgot-password/route.ts`). **Required in production** — see below. |
| `RESEND_API_KEY` | API key for [Resend](https://resend.com), used to send password-reset, invoice-reminder, and payment-receipt emails. Until a custom sending domain is verified in Resend, the sender (`onboarding@resend.dev`) can only deliver to the Resend account's own email address. |
| `REMINDER_FROM_ADDRESS` | Sender address for invoice reminder emails (e.g. `Remitrak <billing@yourdomain.com>`). **Required in production** — see below. |
| `RECEIPT_FROM_ADDRESS` | Sender address for payment-receipt emails (e.g. `Remitrak <receipts@send.remitrak.com>`). **Required in production** — see below. |
| `RESET_PASSWORD_FROM_ADDRESS` | Sender address for password-reset emails (e.g. `Remitrak <accounts@send.remitrak.com>`). **Required in production** — see below. |

All three `*_FROM_ADDRESS` variables default to `Remitrak <onboarding@resend.dev>` outside production, which is fine for local dev since Resend's sandbox address can only deliver to the Resend account's own email anyway. **In production (`VERCEL_ENV=production`), that fallback is disabled on purpose**: `src/lib/email.ts` refuses to silently use the sandbox address for a real recipient, since it would appear to work while every send actually gets rejected by Resend with no visible error. Leaving any of these three unset in production means that email type stops sending entirely — set a sending domain up in Resend, verify it, and set all three before deploying. `npm run check:required-env` (see below) gates this in CI.

After changing `DATABASE_URL`, run `npm run db:migrate` (or apply migrations however your deploy pipeline does it) and `npm run db:seed` if you need demo data.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Required pre-deploy step: check for pending migrations

Before every deploy, run:

```bash
DATABASE_URL=<production connection string> npm run db:check-prod-migrations
```

This is read-only — it runs `prisma migrate status` against production and exits non-zero (failing loudly) if any migrations are unapplied, the migration history has diverged, the `_prisma_migrations` table is missing, or the database can't be reached. It refuses to run at all unless `DATABASE_URL` resolves to the known production host, so it can't be accidentally satisfied by a clean dev database.

Do not proceed with the deploy if this check fails — resolve the pending migration first (see the `db:apply-prod-*` / `db:resolve-prod-*` scripts in `prisma/` for the pattern used to apply one-off production migrations). This step exists because a schema change once reached production without its migration having been applied, and nothing in the deploy process caught it.

### Required pre-deploy step: check required env vars

Also runs automatically in CI (see below), but can be run locally too:

```bash
VERCEL_TOKEN=<token> VERCEL_ORG_ID=<org id> VERCEL_PROJECT_ID=<project id> npm run check:required-env
```

This is read-only — it runs `vercel pull` against Vercel's actual **Production** environment (not this checkout's local `.env`, and not just what's documented above) and fails loudly if `RESEND_API_KEY`, `REMINDER_FROM_ADDRESS`, `RECEIPT_FROM_ADDRESS`, or `RESET_PASSWORD_FROM_ADDRESS` is missing there. This step exists because `RECEIPT_FROM_ADDRESS` once shipped in code without ever being added to Vercel, which made payment-receipt emails silently fail in production (see `src/lib/email.ts`'s `resolveFromAddress` for the runtime guard this pairs with).

### CI

`.github/workflows/check-prod-migrations.yml` and `.github/workflows/check-required-env.yml` both run on every PR into master and every push to master. `check-prod-migrations` is wired as a required status check in branch protection; `check-required-env` should be added there too once its repo secrets exist (Settings → Branches → branch protection rule for `master` → add "Check required env vars / check-required-env" to required status checks). Repo secrets needed: the migrations check needs `PROD_DATABASE_URL`; the env-var check needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.
