import type { ParsedStatementRow } from "./bankStatementExtraction";

const ANCHOR_RE = /(\d{2}) ([A-Za-z]{3}) (\d{4}) \d{2}:\d{2}:\d{2} (\d{2}) ([A-Za-z]{3}) (\d{4})/g;
const MONEY_RE = /--|\d{1,3}(?:,\d{3})*\.\d{2}/g;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function toIsoDate(day: string, mon: string, year: string): string | null {
  const month = MONTHS[mon];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function parseAmount(token: string): number {
  return Number(token.replace(/,/g, ""));
}

interface RawRow {
  index: number; // absolute offset in the normalized text where this row's anchor starts
  date: string;
  description: string;
  amount: number;
  reference: string;
}

function parseRows(normalized: string): RawRow[] {
  const anchors = [...normalized.matchAll(ANCHOR_RE)];
  const rows: RawRow[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const start = anchor.index;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : normalized.length;
    const chunk = normalized.slice(start, end);
    const anchorLength = anchor[0].length;

    const [, , , , day, mon, year] = anchor; // groups 4-6 are the Value Date, not Trans. Time
    const date = toIsoDate(day, mon, year);
    if (!date) continue;

    const moneyMatches = [...chunk.matchAll(MONEY_RE)];
    if (moneyMatches.length < 3) continue;
    const [debitToken, creditToken, balanceToken] = moneyMatches;

    const debitIsAmount = debitToken[0] !== "--";
    const creditIsAmount = creditToken[0] !== "--";
    if (debitIsAmount === creditIsAmount) continue; // both blank or both filled — malformed, drop rather than guess

    const amount = debitIsAmount ? -parseAmount(debitToken[0]) : parseAmount(creditToken[0]);

    const description = chunk.slice(anchorLength, debitToken.index).replace(/\s+/g, " ").trim();
    if (!description) continue;

    const afterBalance = chunk.slice(balanceToken.index + balanceToken[0].length);
    const mobileMatch = afterBalance.match(/Mobile([\s\S]*)/);
    const reference = mobileMatch ? (mobileMatch[1].match(/\d+/g) ?? []).join("") : "";

    rows.push({ index: start, date, description, amount, reference });
  }

  return rows;
}

function dedupeByReference(rows: RawRow[]): { rows: RawRow[]; flagged: Set<number> } {
  const byRef = new Map<string, RawRow[]>();
  for (const row of rows) {
    if (!row.reference) continue;
    const group = byRef.get(row.reference) ?? [];
    group.push(row);
    byRef.set(row.reference, group);
  }

  const flagged = new Set<number>();
  const toDrop = new Set<number>();

  for (const group of byRef.values()) {
    if (group.length < 2) continue;
    const allSame = group.every((r) => r.amount === group[0].amount);
    if (allSame) {
      for (const dup of group.slice(1)) toDrop.add(dup.index);
    } else {
      for (const row of group) flagged.add(row.index);
    }
  }

  return { rows: rows.filter((r) => !toDrop.has(r.index)), flagged };
}

function checkDeclaredCounts(normalized: string, rows: RawRow[]): string[] {
  const reasons: string[] = [];
  const blockRe = /Credit Count\s+(\d+)[\s\S]*?Debit Count\s+(\d+)/g;
  const blocks = [...normalized.matchAll(blockRe)];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const sectionStart = block.index + block[0].length;
    const sectionEnd = i + 1 < blocks.length ? blocks[i + 1].index : normalized.length;
    const expectedCredit = Number(block[1]);
    const expectedDebit = Number(block[2]);

    const sectionRows = rows.filter((r) => r.index >= sectionStart && r.index < sectionEnd);
    const actualCredit = sectionRows.filter((r) => r.amount > 0).length;
    const actualDebit = sectionRows.filter((r) => r.amount < 0).length;

    if (actualCredit !== expectedCredit || actualDebit !== expectedDebit) {
      reasons.push(
        `Extracted row counts don't match this statement's own declared totals (expected ${expectedCredit} credit / ${expectedDebit} debit, got ${actualCredit} credit / ${actualDebit} debit) — some rows may be missing or miscounted.`
      );
    }
  }

  return reasons;
}

export interface TraditionalExtractionResult {
  rows: ParsedStatementRow[];
  lowConfidenceReasons: string[];
}

export function extractTraditional(statementText: string): TraditionalExtractionResult {
  const normalized = statementText.replace(/\s+/g, " ");
  const rawRows = parseRows(normalized);
  const { rows: dedupedRows, flagged } = dedupeByReference(rawRows);

  const rows: ParsedStatementRow[] = dedupedRows.map((row) =>
    flagged.has(row.index)
      ? {
          date: row.date,
          description: row.description,
          amount: row.amount,
          needsReview: true,
          reviewReason: `Same reference (${row.reference}) appears elsewhere in the statement with a conflicting amount/sign — couldn't determine which is correct.`,
        }
      : { date: row.date, description: row.description, amount: row.amount }
  );

  const lowConfidenceReasons: string[] = [];
  if (rows.length === 0) {
    lowConfidenceReasons.push("No transactions could be parsed from this statement.");
  }
  const needsReviewCount = rows.filter((r) => r.needsReview).length;
  if (needsReviewCount > 0) {
    lowConfidenceReasons.push(
      `${needsReviewCount} transaction(s) have a conflicting duplicate elsewhere in the statement and need manual review.`
    );
  }
  lowConfidenceReasons.push(...checkDeclaredCounts(normalized, dedupedRows));

  return { rows, lowConfidenceReasons };
}
