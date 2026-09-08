export interface MatchableBankTransaction {
  id: string;
  amount: number;
  dateIso: string; // yyyy-mm-dd
  description: string;
}

export interface MatchablePayment {
  id: string;
  amount: number;
  paidDateIso: string; // yyyy-mm-dd
  clientName: string;
}

export interface MatchableInvoice {
  id: string;
  amount: number; // outstanding balance
  clientName: string;
}

export type MatchTier = "exact" | "review";

export interface MatchCandidate {
  kind: "payment" | "invoice";
  id: string;
  tier: MatchTier;
}

export interface TransactionMatchCandidates {
  transactionId: string;
  candidates: MatchCandidate[];
}

export type MatchClassification =
  | { bucket: "none" }
  | { bucket: "auto"; candidate: MatchCandidate }
  | { bucket: "review"; candidates: MatchCandidate[] };

const AMOUNT_EPSILON = 0.01;
const TOLERANCE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  const diff = new Date(`${a}T00:00:00.000Z`).getTime() - new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.abs(diff) / MS_PER_DAY;
}

// Uppercases, strips diacritics/punctuation, and collapses whitespace so
// "O'Brien Adeyemi" and "obrien adeyemi" tokenize identically.
function normalizeNameText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    // Apostrophes are dropped rather than turned into a token boundary, so
    // "O'Brien" and "OBrien"/"obrien" (as a bank narration would likely
    // render it, with no apostrophe at all) tokenize identically.
    .replace(/['’‘`]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  const normalized = normalizeNameText(s);
  return normalized ? normalized.split(" ") : [];
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// How many edits a loose token match tolerates, scaled by token length —
// short tokens (<=3 chars) rely on the initial/prefix rules instead, since an
// edit-distance-1 match on something that short is too easy to hit by chance.
function maxEditDistance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

// A single-letter token standing in for the other's first letter, e.g. "O"
// for "Olaniyi" — common when a bank narration abbreviates a surname.
function isInitialMatch(a: string, b: string): boolean {
  if (a.length === 1 && b.length > 1) return a[0] === b[0];
  if (b.length === 1 && a.length > 1) return b[0] === a[0];
  return false;
}

// One token is a truncation of the other, e.g. "CHIDI" for "CHIDINMA".
// Minimum length 3 keeps this from matching on near-nothing.
function isPrefixMatch(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 3 && longer.startsWith(shorter);
}

type TokenSatisfaction = "exact" | "loose" | "none";

function tokenSatisfaction(clientToken: string, descriptionTokens: string[]): TokenSatisfaction {
  if (descriptionTokens.includes(clientToken)) return "exact";
  for (const dTok of descriptionTokens) {
    if (isInitialMatch(clientToken, dTok)) return "loose";
    if (isPrefixMatch(clientToken, dTok)) return "loose";
    if (levenshtein(clientToken, dTok) <= maxEditDistance(Math.min(clientToken.length, dTok.length))) {
      return "loose";
    }
  }
  return "none";
}

// Every token in clientName must be satisfied by some token in description
// (exactly or loosely) for any tier at all — a single unsatisfied token
// (e.g. a surname with no counterpart) rules the pairing out entirely,
// rather than falling back to a lower-confidence tier. This is what keeps
// two different people who happen to share a first name and an amount from
// ever surfacing as a match candidate.
export function nameMatchTier(clientName: string, description: string): MatchTier | "none" {
  const clientTokens = tokenize(clientName);
  const descriptionTokens = tokenize(description);
  if (clientTokens.length === 0 || descriptionTokens.length === 0) return "none";

  let allExact = true;
  for (const token of clientTokens) {
    const satisfaction = tokenSatisfaction(token, descriptionTokens);
    if (satisfaction === "none") return "none";
    if (satisfaction === "loose") allExact = false;
  }
  return allExact ? "exact" : "review";
}

export function computeMatchCandidates(
  transactions: MatchableBankTransaction[],
  payments: MatchablePayment[],
  invoices: MatchableInvoice[]
): TransactionMatchCandidates[] {
  return transactions.map((transaction) => {
    const candidates: MatchCandidate[] = [];

    for (const payment of payments) {
      if (Math.abs(payment.amount - transaction.amount) > AMOUNT_EPSILON) continue;
      if (daysBetween(payment.paidDateIso, transaction.dateIso) > TOLERANCE_DAYS) continue;
      const tier = nameMatchTier(payment.clientName, transaction.description);
      if (tier === "none") continue;
      candidates.push({ kind: "payment", id: payment.id, tier });
    }

    // Unpaid invoices have no comparable date (an invoice's dueDate has no
    // relationship to when a bank transfer landed), so they're matched on
    // amount + name only — same as the existing "Link manually" direct-invoice
    // flow in search/route.ts and linkInvoiceDirect.
    for (const invoice of invoices) {
      if (Math.abs(invoice.amount - transaction.amount) > AMOUNT_EPSILON) continue;
      const tier = nameMatchTier(invoice.clientName, transaction.description);
      if (tier === "none") continue;
      candidates.push({ kind: "invoice", id: invoice.id, tier });
    }

    return { transactionId: transaction.id, candidates };
  });
}

// A transaction auto-matches only when it has exactly one candidate AND that
// candidate's name matched exactly — two candidates (even two individually
// "exact" ones, e.g. a same-name coincidence) or a single non-exact candidate
// both go to review instead of guessing.
export function classifyMatch(candidates: MatchCandidate[]): MatchClassification {
  if (candidates.length === 0) return { bucket: "none" };
  if (candidates.length === 1 && candidates[0].tier === "exact") {
    return { bucket: "auto", candidate: candidates[0] };
  }
  return { bucket: "review", candidates };
}
