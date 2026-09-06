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
| `APP_BASE_URL` | Absolute base URL used to build password-reset links (e.g. `https://invoiceguard-eta.vercel.app`). Falls back to `http://localhost:3000` outside production; must be set explicitly in production or reset emails will fail to send (see `src/app/api/forgot-password/route.ts`). |
| `RESEND_API_KEY` | API key for [Resend](https://resend.com), used to send password-reset and invoice-reminder emails. Until a custom sending domain is verified in Resend, the sender (`onboarding@resend.dev`) can only deliver to the Resend account's own email address. |
| `REMINDER_FROM_ADDRESS` | Sender address for invoice reminder emails (e.g. `Remitrak <billing@yourdomain.com>`). Defaults to `Remitrak <onboarding@resend.dev>`, which only delivers to the Resend account's own email — set this once a sending domain is verified in Resend so reminders can reach real clients. |

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
