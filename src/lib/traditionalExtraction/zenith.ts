import type { ParsedStatementRow } from "../bankStatementExtraction";
import { normalizeWhitespace, parseAmount, type TraditionalExtractionResult } from "./shared";

const MONEY = "\\d{1,3}(?:,\\d{3})*\\.\\d{2}";
const DATE = "\\d{2}\\/\\d{2}\\/\\d{4}";

// Zenith rows don't have a safe leading anchor: the row's own Value Date
// re-uses the exact same DD/MM/YYYY shape as its Trans Date, and the
// "Period: DATE TO DATE" header line adds a third false candidate. What IS
// unambiguous is the fixed trailing shape every real row ends with —
// Debit, Credit, Value Date, Balance, four tokens in that order — which
// doesn't occur anywhere else in the statement. Anchor on that instead, and
// walk backward from each tail to the previous tail's end to recover the
// Trans Date (the last DATE-shaped token in that span) and description.
const TAIL_RE = new RegExp(`(${MONEY}) (${MONEY}) (${DATE}) (${MONEY})`, "g");
const DATE_RE = new RegExp(DATE, "g");

interface Row {
  date: string;
  description: string;
  amount: number;
  balance: number;
}

function toIsoDate(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split("/");
  return `${year}-${month}-${day}`;
}

function parseRows(normalized: string): Row[] {
  const tails = [...normalized.matchAll(TAIL_RE)];
  const rows: Row[] = [];
  let prevEnd = 0;

  for (const tail of tails) {
    const leading = normalized.slice(prevEnd, tail.index);
    prevEnd = tail.index + tail[0].length;

    const dateMatches = [...leading.matchAll(DATE_RE)];
    const transDateMatch = dateMatches[dateMatches.length - 1];
    if (!transDateMatch) continue; // no Trans Date found — this tail isn't a real row (shouldn't happen after the header row)

    const description = leading.slice(transDateMatch.index + transDateMatch[0].length).replace(/\s+/g, " ").trim();
    if (!description) continue;

    const [, debitToken, creditToken, valueDateToken, balanceToken] = tail;
    const debit = parseAmount(debitToken);
    const credit = parseAmount(creditToken);
    const debitIsAmount = debit !== 0;
    const creditIsAmount = credit !== 0;
    if (debitIsAmount === creditIsAmount) continue; // both zero or both filled — malformed, drop rather than guess

    const amount = debitIsAmount ? -debit : credit;
    const date = toIsoDate(valueDateToken);
    const balance = parseAmount(balanceToken);

    rows.push({ date, description, amount, balance });
  }

  return rows;
}

function parseOpeningBalance(normalized: string): number | null {
  const match = normalized.match(new RegExp(`Opening Balance ${MONEY} ${MONEY} (${MONEY})`));
  return match ? parseAmount(match[1]) : null;
}

function checkBalanceReconciliation(normalized: string, rows: Row[]): string[] {
  if (rows.length === 0) return [];
  const openingBalance = parseOpeningBalance(normalized);
  if (openingBalance === null) return [];

  const expectedClosingBalance = rows.reduce((balance, row) => balance + row.amount, openingBalance);
  const actualClosingBalance = rows[rows.length - 1].balance;

  if (Math.abs(expectedClosingBalance - actualClosingBalance) < 0.01) return [];

  return [
    `Extracted transactions don't reconcile with this statement's own Opening Balance and running balance (expected a closing balance of ${expectedClosingBalance.toFixed(2)} from Opening Balance ${openingBalance.toFixed(2)} plus extracted transactions, but the statement's own last balance is ${actualClosingBalance.toFixed(2)}) — some rows may be missing or miscounted.`,
  ];
}

export function extractZenith(statementText: string): TraditionalExtractionResult {
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
  lowConfidenceReasons.push(...checkBalanceReconciliation(normalized, parsedRows));

  return { rows, lowConfidenceReasons };
}
