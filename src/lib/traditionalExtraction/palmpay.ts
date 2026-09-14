import type { ParsedStatementRow } from "../bankStatementExtraction";
import { normalizeWhitespace, type TraditionalExtractionResult } from "./shared";

// Trans Date + time + AM/PM, e.g. "09/14/2026 08:58:34 AM". Unique enough to
// anchor each row, with one known false-positive: the header's own
// "Print Time DD/MM/YYYY HH:MM:SS AM/PM" line matches the same shape. That
// chunk never contains a signed amount, so it's dropped by the amount check
// below rather than needing a separate carve-out.
const ANCHOR_RE = /(\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2}:\d{2} (?:AM|PM)/g;
// Unlike the header's declared totals (which use comma thousands
// separators, e.g. "₦1,173,548.00"), individual transaction row amounts in
// this format are NOT comma-grouped (e.g. "-12000.00", "-2450.00") — so
// this can't reuse the comma-grouped \d{1,3}(?:,\d{3})* shape the other
// formats' money regexes use.
const SIGNED_AMOUNT_RE = /[-+]\d[\d,]*\.\d{2}/g;

function toIsoDate(month: string, day: string, year: string): string {
  return `${year}-${month}-${day}`;
}

function parseSignedAmount(token: string): number {
  const sign = token[0] === "-" ? -1 : 1;
  return sign * Number(token.slice(1).replace(/,/g, ""));
}

interface Row {
  date: string;
  description: string;
  amount: number;
}

function parseRows(normalized: string): Row[] {
  const anchors = [...normalized.matchAll(ANCHOR_RE)];
  const rows: Row[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const start = anchor.index;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : normalized.length;
    const chunk = normalized.slice(start, end);
    const anchorLength = anchor[0].length;

    const [, month, day, year] = anchor;
    const date = toIsoDate(month, day, year);

    const amountMatch = chunk.match(SIGNED_AMOUNT_RE);
    if (!amountMatch) continue; // no signed amount in this chunk — e.g. the "Print Time" header line, not a real row

    const amountToken = amountMatch[0];
    const amountIndex = chunk.indexOf(amountToken);
    const amount = parseSignedAmount(amountToken);

    const description = chunk.slice(anchorLength, amountIndex).replace(/\s+/g, " ").trim();
    if (!description) continue;

    rows.push({ date, description, amount });
  }

  return rows;
}

function parseDeclaredTotal(normalized: string, label: string): number | null {
  const match = normalized.match(new RegExp(`${label}\\s*[₦]\\s*([\\d,]+\\.\\d{2})`));
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function formatNaira(amount: number): string {
  return `₦${amount.toFixed(2)}`;
}

function checkDeclaredTotals(normalized: string, rows: Row[]): string[] {
  const expectedIn = parseDeclaredTotal(normalized, "Total Money In");
  const expectedOut = parseDeclaredTotal(normalized, "Total Money Out");
  if (expectedIn === null || expectedOut === null) return [];

  const actualIn = rows.filter((r) => r.amount > 0).reduce((sum, r) => sum + r.amount, 0);
  const actualOut = rows.filter((r) => r.amount < 0).reduce((sum, r) => sum - r.amount, 0);

  const inMatches = Math.abs(actualIn - expectedIn) < 0.01;
  const outMatches = Math.abs(actualOut - expectedOut) < 0.01;
  if (inMatches && outMatches) return [];

  return [
    `Extracted totals don't match this statement's own declared totals (expected ${formatNaira(expectedIn)} in / ${formatNaira(expectedOut)} out, got ${formatNaira(actualIn)} in / ${formatNaira(actualOut)} out) — some rows may be missing or miscounted.`,
  ];
}

export function extractPalmPay(statementText: string): TraditionalExtractionResult {
  const normalized = normalizeWhitespace(statementText);
  const parsedRows = parseRows(normalized);

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
