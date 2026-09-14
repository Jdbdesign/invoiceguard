import type { ParsedStatementRow } from "../bankStatementExtraction";
import { normalizeWhitespace, parseAmount, type TraditionalExtractionResult } from "./shared";

// Trans. Date immediately followed by Value. Date, e.g.
// "16-Aug-2026 16-Aug-2026" — no time component (unlike OWealth), so this
// can't reuse OWealth's anchor regex. The "Statement Period :X to Y" header
// line also has two dash-dates, but separated by the literal word "to"
// rather than being directly adjacent, so it doesn't match this anchor.
const ANCHOR_RE = /(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2})-([A-Za-z]{3})-(\d{4})/g;
// Unlike every other format, an empty Debit/Credit cell here produces no
// placeholder token at all (not "--", not "0.00") — so there's no way to
// tell which column the one visible amount came from. Sign is instead
// derived from the running balance delta (see parseRows). Amounts can also
// appear with no leading zero before the decimal (".23" instead of "0.23"),
// which the plain \d{1,3}(?:,\d{3})*\.\d{2} shape used elsewhere would miss.
const MONEY_RE = /\d{1,3}(?:,\d{3})*\.\d{2}|\.\d{2}/g;
// pdf-parse's own page-break marker (e.g. "-- 1 of 3 --", already relied on
// elsewhere in this codebase to recognize non-transaction text). A row's
// chunk can span a page boundary, picking this up mid-description along
// with the repeated letterhead boilerplate that follows it on the next
// page — cut the description off at the first occurrence rather than try
// to parse the boilerplate itself.
const PAGE_BREAK_RE = / -- \d+ of \d+ --[\s\S]*$/;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function toIsoDate(day: string, mon: string, year: string): string | null {
  const month = MONTHS[mon];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

interface Row {
  date: string;
  description: string;
  amount: number;
}

function parseRows(normalized: string, openingBalance: number): Row[] {
  const anchors = [...normalized.matchAll(ANCHOR_RE)];
  const rows: Row[] = [];
  let previousBalance = openingBalance;

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const start = anchor.index;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : normalized.length;
    const chunk = normalized.slice(start, end);

    const [, , , , day, mon, year] = anchor; // groups 4-6 are the Value Date
    const date = toIsoDate(day, mon, year);
    if (!date) continue;

    const moneyMatches = [...chunk.matchAll(MONEY_RE)];
    if (moneyMatches.length < 2) continue;
    const [amountToken, balanceToken] = moneyMatches;

    const magnitude = parseAmount(amountToken[0]);
    const balance = parseAmount(balanceToken[0]);
    const amount = balance >= previousBalance ? magnitude : -magnitude;
    previousBalance = balance;

    const description = chunk
      .slice(balanceToken.index + balanceToken[0].length)
      .replace(/\s+/g, " ")
      .replace(PAGE_BREAK_RE, "")
      .trim();
    if (!description) continue;

    rows.push({ date, description, amount });
  }

  return rows;
}

function parseHeaderAmount(normalized: string, label: string): number | null {
  const match = normalized.match(new RegExp(`${label} ([\\d,]+\\.\\d{2})`));
  return match ? parseAmount(match[1]) : null;
}

function checkDeclaredTotals(normalized: string, rows: Row[]): string[] {
  const expectedDebit = parseHeaderAmount(normalized, "Total Debit");
  const expectedCredit = parseHeaderAmount(normalized, "Total Credit");
  if (expectedDebit === null || expectedCredit === null) return [];

  const actualDebit = rows.filter((r) => r.amount < 0).reduce((sum, r) => sum - r.amount, 0);
  const actualCredit = rows.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);

  const debitMatches = Math.abs(actualDebit - expectedDebit) < 0.01;
  const creditMatches = Math.abs(actualCredit - expectedCredit) < 0.01;
  if (debitMatches && creditMatches) return [];

  return [
    `Extracted totals don't match this statement's own declared totals (expected ${expectedDebit.toFixed(2)} debit / ${expectedCredit.toFixed(2)} credit, got ${actualDebit.toFixed(2)} debit / ${actualCredit.toFixed(2)} credit) — some rows may be missing or miscounted.`,
  ];
}

export function extractGtbank(statementText: string): TraditionalExtractionResult {
  const normalized = normalizeWhitespace(statementText);
  const openingBalance = parseHeaderAmount(normalized, "Opening Balance");

  // Sign derivation is entirely dependent on a starting balance to diff
  // against — without it we'd have to guess every row's sign, which this
  // codebase's extractors deliberately never do.
  if (openingBalance === null) {
    return { rows: [], lowConfidenceReasons: ["No transactions could be parsed from this statement."] };
  }

  const parsedRows = parseRows(normalized, openingBalance);

  const rows: ParsedStatementRow[] = parsedRows.map((row) => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
  }));

  const lowConfidenceReasons: string[] = [];
  if (rows.length === 0) {
    lowConfidenceReasons.push("No transactions could be parsed from this statement.");
  }
  lowConfidenceReasons.push(...checkDeclaredTotals(normalized, parsedRows));

  return { rows, lowConfidenceReasons };
}
