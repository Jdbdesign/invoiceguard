# Mobile Responsive Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mobile/narrow-viewport (375–428px) layout defects identified in a completed Phase 1 audit of InvoiceGuard's app shell, list pages, client detail page, modals, and toasts — without changing desktop (≥ current layout) behavior at all. This is a breakpoint-conditional-render exercise, not a redesign.

**Spec:** No separate spec doc. This plan is written directly from a completed manual audit (10 numbered findings, reasoning through Tailwind classes at 375/428px, no browser automation available) plus a full read of every file in scope: `Sidebar.tsx`, `(app)/layout.tsx`, `Modal.tsx`, `ToastContext.tsx`, `clients/page.tsx`, `invoices/page.tsx`, `clients/[id]/page.tsx`, `InvoiceFormModal.tsx`, `CreatePaymentPlanModal.tsx`, `RowActionsMenu.tsx`, `Card.tsx`, `settings/page.tsx`.

**Audit findings this plan addresses** (numbering preserved from the audit):
1. Sidebar — fixed `w-60`, no responsive collapse, squeezes content on narrow screens.
2. Clients list table (5 cols) — clips instead of scrolling (parent `overflow-hidden`), status/actions unreachable on mobile.
3. Invoices list table (7 cols + buttons) — same clipping issue, worse.
4. Client detail invoice rows — flex row with no wrap; buttons ("Settle remaining balance" especially) get clipped/pushed off at 375–428px.
5. Client detail payment-plan installment rows — same flex pattern, tighter.
6. Client detail header card — wraps correctly but "Total owed" block looks orphaned/misaligned after wrap.
7. `Modal.tsx` — no max-height/overflow-y-auto; tall modals can overflow off-screen with no scroll.
8. Form modals' `grid-cols-2` layouts (`InvoiceFormModal`, `CreatePaymentPlanModal`) don't collapse to 1 column on mobile.
9. Settings accordion rows — audited as "likely fine," left untouched per the ruling below.
10. Toast notifications — fixed `bottom-6 right-6`, no max-width, can run edge-to-edge on narrow screens.

**Decisions confirmed before writing this plan:**
- Navigation: hamburger icon in a mobile-only top header bar, opens the existing `Sidebar` content as a slide-in overlay drawer. Closes on outside-click (backdrop) or nav-link selection. Desktop layout (sidebar always visible, no header bar) is pixel-identical above the breakpoint.
- Mobile breakpoint for structural changes (nav drawer, table→card swaps): Tailwind `md:` (768px). **Ruling:** the codebase has no prior convention for a nav/table breakpoint (only one `lg:` usage, for the client-detail page's 5-column content grid, which is a different kind of decision). `md:` is the standard choice for a sidebar/nav collapse and leaves comfortable margin above the 375–428px test range. Flagged here per this project's working style of surfacing breakpoint/architecture choices rather than picking silently.
- Breakpoint for the two `grid-cols-2` form-modal collapses: `sm:` (640px), matching the codebase's one existing precedent (`settings/page.tsx`'s `grid-cols-1 gap-6 px-5 py-5 sm:grid-cols-3`).
- Tables (Clients list, Invoices list): below `md:`, replace the `<table>` with a stacked card layout — one card per row, same information, plus existing actions. Desktop keeps the exact current `<table>` unchanged above `md:` (breakpoint-conditional render: `hidden md:table` / `md:hidden`, not two different data models).
- **Ruling:** the generic card spec says "primary action button, 3-dot menu for secondary actions." The Clients table has no separate primary action today (only the `RowActionsMenu` dropdown) — the Clients card therefore carries only the dropdown, matching current parity. The Invoices table does expose a visible primary action ("Draft reminder") beside the dropdown — the Invoices card carries both, matching current parity. Not inventing a new primary action where the desktop table doesn't have one.
- **Ruling on #5 (installment rows):** folded into the same task as #4 (same file, same `flex-wrap` treatment, cheap to do consistently) per the instruction to apply preemptively where cheap.
- **Ruling on #9 (settings accordion):** the audit already assessed this as "likely fine" (the row is a `<button className="flex w-full items-center justify-between ...">` with a chevron `flex-shrink-0` icon — a different shape than the invoice/installment rows, not a one-line `flex-wrap` fix). Left untouched, flagged for the user's manual visual check as originally scoped. Do not touch this file in this plan.
- Modal fix (#7): use the standard "shrink-0 header + scrollable body" flex pattern (`flex max-h-[90vh] flex-col` on the card, `flex-shrink-0` on the header, `overflow-y-auto` on the body) rather than making the whole card (header included) scroll as one block. This keeps the close button and title always visible/reachable even when the body scrolls — a strictly better outcome than the literal two-class ask, at the same diff size (three class-list edits, no new elements, no JS changes). Flagged here as a deliberate improvement over the literal instruction, not a silent scope change.

## Global Constraints

- Repo root for all paths below: `c:\Users\HP\Downloads\ARAP agentic tool\invoiceguard`
- Work happens in the existing worktree at `.claude/worktrees/mobile-responsive` on branch `worktree-mobile-responsive`. Never touch `master`. Do not merge, push, or deploy — the user will do a manual visual click-through before approving merge.
- Every change in this plan is additive/conditional CSS (Tailwind utility classes) or a new client component for the nav drawer. No data-layer, API, or Prisma changes anywhere in this plan.
- Desktop behavior (≥ the relevant breakpoint) must remain pixel-identical to current behavior in every task. If a task's diff changes any class that applies at or above its breakpoint (not just below it), that is a spec violation.
- Follow existing conventions exactly: Tailwind utility-class style matching surrounding code (no new CSS files, no `@apply`), `@/` path alias to `src/`, function-per-file component style already used in this codebase.
- No test framework installed. Verification per task is `npx tsc --noEmit` (from the worktree root) plus `npm run lint`, plus the manual reasoning-through-classes-at-375/428px check described in each task (no browser automation available in this environment).
- Do not touch `settings/page.tsx` (see ruling on #9 above) — out of scope for this plan.

---

## Task 1: Modal.tsx — scrollable body for tall modals

**Files:**
- Modify: `src/components/ui/Modal.tsx`

**Interfaces:** No prop or signature changes — purely a class-list change to the existing markup. Every consumer (`ClientFormModal`, `InvoiceFormModal`, `CreatePaymentPlanModal`, `ReminderModal`, `ConfirmModal`, `ConfirmDeleteModal`) benefits automatically with zero changes to those files.

- [ ] **Step 1:** In the card `div` (currently `className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"`), add `flex`, `max-h-[90vh]`, and `flex-col` so the card becomes a capped-height flex column:
  ```
  className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
  ```
- [ ] **Step 2:** On the header `div` (currently `className="flex items-center justify-between border-b border-slate-100 px-6 py-4"`), add `flex-shrink-0` so it never gets compressed by the body's growth:
  ```
  className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4"
  ```
- [ ] **Step 3:** On the body `div` (currently `className="px-6 py-5"`), add `overflow-y-auto`:
  ```
  className="overflow-y-auto px-6 py-5"
  ```

**Why this works without an explicit `min-h-0`:** the body div has `overflow-y-auto` (not `visible`), so per the flexbox spec its automatic minimum size resolves to `0` instead of its content size — it can shrink to fit the space left after the header's fixed height, and only then does the internal scrollbar kick in. Short modals (e.g. `ConfirmModal`) are unaffected: the card's height is still just "header + short body," well under `90vh`, no scrollbar appears.

**Test at 375/428px (reasoning, no browser):** open `ReminderModal` or `CreatePaymentPlanModal` mentally with a keyboard-shrunk viewport (~50% height) — card height is capped at `90vh` of the *visual* viewport, header (close button + title) stays put, body scrolls internally. `ConfirmModal`/`ConfirmDeleteModal` (short content) render unchanged.

**Model:** cheap tier (single file, complete spec, mechanical).

---

## Task 2: ToastContext.tsx — constrain toast width on mobile

**Files:**
- Modify: `src/context/ToastContext.tsx`

**Interfaces:** No signature changes.

- [ ] **Step 1:** Change the toast container's className from:
  ```
  className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2"
  ```
  to:
  ```
  className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
  ```
  Do not change the individual toast `div` (the one with `animate-in pointer-events-auto flex items-center gap-2 ...`) — no edits needed there.

**Why this works:** below `sm:`, `inset-x-4` gives the container a definite width (viewport minus 1rem margins each side) and `items-stretch` makes each toast fill that width, so long messages wrap inside a bounded box instead of running edge-to-edge. At `sm:` and up, `inset-x-auto sm:right-6 sm:items-end` restores the exact current desktop behavior (fixed to the right edge, shrink-to-fit width) — pixel-identical to today above the breakpoint.

**Test at 375/428px (reasoning):** container box is `375 - 32 = 343px` wide; a long toast message wraps within that box instead of extending past the right edge.

**Model:** cheap tier (single file, one class-list line, mechanical).

---

## Task 3: Mobile hamburger + slide-in nav drawer

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/AppShell.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- `Sidebar` gains two new optional props: `mobileOpen?: boolean` and `onClose?: () => void`. Existing callers that don't pass them keep working (both undefined → treated as closed/no-op), but this plan updates the only caller (`AppLayout`) to go through the new `AppShell` instead, so `Sidebar` is called with both props from `AppShell`.
- New `AppShell` component: `{ userEmail: string; children: React.ReactNode }` — a `"use client"` component owning the `mobileNavOpen` boolean state, rendering the mobile-only header bar + `Sidebar` + `main`. This replaces the `<div className="flex h-screen ...">` markup currently inline in `layout.tsx`.
- `(app)/layout.tsx` stays a server component (keeps its `await auth()` call) but delegates all client-side layout/state to `AppShell`.

- [ ] **Step 1: Modify `src/components/layout/Sidebar.tsx`**

  Change the function signature:
  ```tsx
  export function Sidebar({
    userEmail,
    mobileOpen = false,
    onClose,
  }: {
    userEmail: string;
    mobileOpen?: boolean;
    onClose?: () => void;
  }) {
  ```

  Wrap the return in a fragment containing an optional mobile backdrop before the `<aside>`, and change the `<aside>`'s className to be `fixed` + slide-in on mobile, `static` on desktop:

  ```tsx
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-60 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* ... existing header/logo div, unchanged ... */}
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={/* unchanged */}
              >
                <Icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {/* ... existing footer div, unchanged ... */}
      </aside>
    </>
  );
  ```

  Notes:
  - Only two things change inside `<aside>`'s existing children: nothing in the logo header div or the footer (user email / logout) div — copy them verbatim from the current file. The only added line is `onClick={onClose}` on each `<Link>` (closes the drawer on mobile when a nav item is chosen; harmless no-op when `onClose` is undefined, i.e. when rendered without drawer props).
  - The `<aside>` no longer has a bare `flex` class fighting with the mobile `hidden`/`flex` toggle — it is always `flex` (via `flex h-full w-60 flex-shrink-0 flex-col`, kept from the original), and visibility on mobile is controlled purely by `translate-x` (off-screen at `-translate-x-full` when closed), not `display:none` — this keeps the slide transition working (a `hidden` element can't animate).
  - At `md:` and up: `md:static md:z-auto md:translate-x-0` overrides the fixed/transform positioning entirely, so desktop is pixel-identical to the current `<aside className="flex h-full w-60 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900">` — same box, back in normal flex-row flow next to `<main>`.

- [ ] **Step 2: Create `src/components/layout/AppShell.tsx`**

  ```tsx
  "use client";

  import { useState } from "react";
  import { Sidebar } from "./Sidebar";

  export function AppShell({
    userEmail,
    children,
  }: {
    userEmail: string;
    children: React.ReactNode;
  }) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    return (
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar
          userEmail={userEmail}
          mobileOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">
              InvoiceGuard
            </span>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Modify `src/app/(app)/layout.tsx`**

  Replace the whole file with:
  ```tsx
  import { AppShell } from "@/components/layout/AppShell";
  import { AppDataProvider } from "@/context/AppDataContext";
  import { auth } from "@/auth";

  export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    const userEmail = session?.user?.email ?? "";

    return (
      <AppDataProvider>
        <AppShell userEmail={userEmail}>{children}</AppShell>
      </AppDataProvider>
    );
  }
  ```

**Test at 375/428px (reasoning):** below `md:`, `<aside>` sits at `-translate-x-full` (fully off-screen left) until `mobileNavOpen` is true; the mobile `<header>` (hamburger + wordmark) is visible (`md:hidden` only hides it at `md:`+); tapping the hamburger sets `translate-x-0` (slides in over content, backdrop dims the rest, clicking backdrop or any nav link closes it). At `md:` (768px) and up: mobile header disappears (`md:hidden`), sidebar is `md:static md:translate-x-0` — same always-visible left column as today, backdrop never renders (only rendered `mobileOpen && ...`, and drawer-close on nav doesn't matter since desktop nav doesn't rely on `onClose`).

**Model:** standard tier (multi-file coordination, new component, judgment on the flex/transform pattern).

---

## Task 4: Clients list — stacked cards below `md:`

**Files:**
- Modify: `src/app/(app)/clients/page.tsx`

**Interfaces:** No changes to `useAppData`, `useToast`, or any prop signatures — purely a rendering split of the existing `rows` array (already computed) into two conditionally-visible layouts.

- [ ] **Step 1:** Wrap the existing `<table>` element (unchanged internals) so it only renders at `md:` and up. Change:
  ```tsx
  <table className="w-full text-left text-sm">
  ```
  to:
  ```tsx
  <table className="hidden w-full text-left text-sm md:table">
  ```

- [ ] **Step 2:** Immediately after the `</table>` closing tag (still inside the same `<Card className="overflow-hidden">`), add a mobile-only stacked card list rendering the same `rows`:

  ```tsx
  <div className="divide-y divide-slate-100 md:hidden">
    {rows.map(({ client, totalOwed, oldestOverdue, status }) => {
      const badge = clientStatusLabel(status);
      return (
        <div key={client.id} className="flex items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <Link
              href={`/clients/${client.id}`}
              className="font-medium text-slate-900 hover:text-blue-600"
            >
              {client.name}
            </Link>
            <p className="truncate text-xs text-slate-500">{client.email}</p>
            <p className="mt-2 text-sm font-medium tabular-nums text-slate-900">
              {formatCurrency(totalOwed, client.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {oldestOverdue ? (
                <>
                  {oldestOverdue.id}{" "}
                  <span className="text-slate-400">
                    due {formatDate(oldestOverdue.dueDate)}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">No overdue invoices</span>
              )}
            </p>
            <div className="mt-2">
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          </div>
          <RowActionsMenu
            onEdit={() => setEditingClient(client)}
            onDelete={() => setDeletingClient(client)}
          />
        </div>
      );
    })}
  </div>
  ```

  All identifiers used here (`rows`, `clientStatusLabel`, `formatCurrency`, `formatDate`, `Link`, `Badge`, `RowActionsMenu`, `setEditingClient`, `setDeletingClient`) already exist in this file — no new imports needed.

**Test at 375/428px (reasoning):** `md:hidden` div renders, `hidden ... md:table` table doesn't (`display:none` below `md:`) — no clipped table, no duplicate content. At `md:` (768px)+: exact reverse, table renders exactly as it does today (only the `hidden` class was added, no other change to the `<table>` subtree), card div is `display:none`.

**Model:** standard tier (data-mapping correctness matters, moderate size).

---

## Task 5: Invoices list — stacked cards below `md:`

**Files:**
- Modify: `src/app/(app)/invoices/page.tsx`

**Interfaces:** No changes to `useAppData`, `useToast`, or prop signatures — same pattern as Task 4, applied to the `rows` array already computed via `useMemo`.

- [ ] **Step 1:** Wrap the existing `<table>` so it only renders at `md:` and up:
  ```tsx
  <table className="hidden w-full text-left text-sm md:table">
  ```

- [ ] **Step 2:** Immediately after `</table>` (still inside `<Card className="overflow-hidden">`), add:

  ```tsx
  <div className="divide-y divide-slate-100 md:hidden">
    {rows.map((invoice) => {
      const client = getClientById(clients, invoice.clientId);
      const badge = invoiceStatusLabel(invoice);
      const overdue = getDaysOverdue(invoice);
      return (
        <div key={invoice.id} className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{invoice.id}</p>
              <Link
                href={`/clients/${invoice.clientId}`}
                className="text-sm text-slate-600 hover:text-blue-600"
              >
                {client?.name}
              </Link>
            </div>
            <RowActionsMenu
              onEdit={() => setEditingInvoice(invoice)}
              onDelete={() => setDeletingInvoice(invoice)}
              onCreatePaymentPlan={
                invoice.status !== "paid" &&
                !invoiceHasPaymentPlan(invoice.id, paymentPlans)
                  ? () => setCreatingPlanFor(invoice)
                  : undefined
              }
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium tabular-nums text-slate-900">
              {formatCurrency(getInvoiceBalance(invoice), client?.currency)}
            </span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Due {formatDate(invoice.dueDate)}
            {invoice.status !== "paid" && overdue !== null && overdue > 0 && (
              <span className="ml-1.5 text-slate-400">· {overdue}d overdue</span>
            )}
          </p>
          {invoice.status !== "paid" && (
            <button
              onClick={() => setDraftingReminderFor(invoice.id)}
              className="mt-3 w-full rounded-md border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              Draft reminder
            </button>
          )}
        </div>
      );
    })}
    {rows.length === 0 && (
      <div className="px-4 py-8 text-center text-sm text-slate-500">
        No invoices match this filter.
      </div>
    )}
  </div>
  ```

  All identifiers used (`rows`, `clients`, `paymentPlans`, `getClientById`, `invoiceStatusLabel`, `getDaysOverdue`, `formatCurrency`, `getInvoiceBalance`, `formatDate`, `invoiceHasPaymentPlan`, `Link`, `Badge`, `RowActionsMenu`, `setEditingInvoice`, `setDeletingInvoice`, `setCreatingPlanFor`, `setDraftingReminderFor`) already exist in this file — no new imports needed.

**Test at 375/428px (reasoning):** same `hidden`/`md:table` + `md:hidden` split as Task 4. The empty-state message, which today lives inside the table as a `colSpan={7}` row, is duplicated into the mobile card list's own empty state so filtering to zero results still shows a message on mobile (the table's own empty-state row still renders in the desktop table, unchanged).

**Model:** standard tier (more fields to map correctly than Task 4, conditional primary-action button, matches the existing table's conditional logic for `onCreatePaymentPlan` and the reminder button).

---

## Task 6: Client detail page — invoice rows, installment rows, header alignment

**Files:**
- Modify: `src/app/(app)/clients/[id]/page.tsx`

**Interfaces:** No signature/logic changes — three independent class-list edits in the same file (grouped into one task because they're the same file and the same visual region, avoiding three near-identical sequential diffs).

- [ ] **Step 1 — invoice rows (#4):** the invoice-row container currently:
  ```tsx
  <div key={invoice.id} className="flex items-center justify-between px-5 py-3.5">
  ```
  becomes:
  ```tsx
  <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
  ```
  and its second child (the balance/badge + action-buttons wrapper), currently:
  ```tsx
  <div className="flex items-center gap-3">
  ```
  becomes:
  ```tsx
  <div className="flex flex-wrap items-center justify-end gap-3">
  ```
  (This is the `<div>` that directly wraps the `text-right` balance/badge block and the `flex flex-col gap-1.5` action-buttons block — do not touch the `text-right` block or the buttons block themselves.)

- [ ] **Step 2 — installment rows (#5):** the installment-row container currently:
  ```tsx
  <div key={inst.id} className="flex items-center justify-between px-5 py-3">
  ```
  becomes:
  ```tsx
  <div key={inst.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
  ```

- [ ] **Step 3 — header "Total owed" alignment (#6):** the header card's second flex child currently:
  ```tsx
  <div className="text-right">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
      Total owed
    </p>
    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
      {formatCurrency(totalOwed, client.currency)}
    </p>
  </div>
  ```
  becomes (only the outer `div`'s className changes):
  ```tsx
  <div className="text-left sm:text-right">
  ```

**Why this works:** #4/#5 use the same one-line `flex-wrap` fix already applied elsewhere in this codebase's audit reasoning — when the row doesn't fit on one line at narrow widths, it wraps as a whole (buttons drop below the invoice/installment info) instead of clipping; adding `flex-wrap` to the *inner* action-cluster div in Step 1 additionally lets the button column drop below the balance/badge if even that pairing doesn't fit in ~270px of available width (Card padding + page padding leaves roughly that much on a 375px viewport). #6: the parent row already has `flex-wrap` (unchanged), so on narrow widths the "Total owed" block drops to its own line below the name/badge/contact block; `text-left` there stops the numbers from looking right-aligned-in-isolation on that orphaned line, while `sm:text-right` (640px+) restores the current right-aligned look once the block is beside the name block instead of below it.

**Test at 375/428px (reasoning):** invoice row — at ~271px available width, "Settle remaining balance" (~150–160px text + padding) fits comfortably once it's allowed onto its own line via wrap, whereas today it's forced inline with the invoice description and clips. Header — at 375px, name+badge+email+phone block is wide enough that "Total owed" already wraps below it (per the original audit finding); it now reads left-aligned like the rest of the page instead of floating right.

**Model:** standard tier (three related but distinct edits in one file, some layout judgment).

---

## Task 7: Form modal grids — collapse to 1 column below `sm:`

**Files:**
- Modify: `src/components/invoices/InvoiceFormModal.tsx`
- Modify: `src/components/invoices/CreatePaymentPlanModal.tsx`

**Interfaces:** No changes — one class-list edit per file, same shape, batched into a single dispatch per the "batch small same-shape work" rule.

- [ ] **Step 1:** In `InvoiceFormModal.tsx`, the grid currently:
  ```tsx
  <div className="grid grid-cols-2 gap-4">
  ```
  (wrapping the Amount/Due-date-or-similar `Field` pair) becomes:
  ```tsx
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  ```

- [ ] **Step 2:** In `CreatePaymentPlanModal.tsx`, the grid currently:
  ```tsx
  <div className="grid grid-cols-2 gap-4">
  ```
  (wrapping the "Number of installments" / "Frequency" `Field` pair) becomes:
  ```tsx
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  ```

**Test at 375/428px (reasoning):** below 640px, each `Field` gets its own full-width row (no cramped half-width inputs); at `sm:` (640px)+, reverts to the current two-up grid — matches the existing `sm:grid-cols-3` precedent in `settings/page.tsx`.

**Model:** cheap tier (two files, one identical one-line change each, fully mechanical).

---

## Final Review

After all 7 tasks are complete and individually reviewed, dispatch the final whole-branch code review per `superpowers:subagent-driven-development`'s Final Review section, using `superpowers:requesting-code-review`'s reviewer template, on the most capable available model. Point it at:
- The ruling on Task 1's modal fix (improved over the literal ask — confirm it doesn't regress any existing modal).
- The `md:` vs `sm:` breakpoint split across tasks (structural nav/table changes at `md:`, grid collapses at `sm:`) — confirm this is applied consistently and doesn't leave any element responsive at the wrong breakpoint relative to its sibling changes.
- Desktop pixel-parity: every task's stated intent is "unchanged above the breakpoint" — the reviewer should specifically diff each `hidden`/`md:`/`sm:`-prefixed class addition against what existed before to confirm no accidental change bleeds into the desktop-visible class set.

Do not merge, push, or deploy after the final review — report back to the user for manual visual click-through per the Global Constraints.
