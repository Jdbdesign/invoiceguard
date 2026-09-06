import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

export interface ParsedStatementRow {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number; // positive = credit/deposit, negative = debit
}

export class StatementExtractionError extends Error {}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRow(row: unknown): row is ParsedStatementRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.date === "string" &&
    ISO_DATE_RE.test(r.date) &&
    typeof r.description === "string" &&
    typeof r.amount === "number" &&
    Number.isFinite(r.amount)
  );
}

function extractRows(text: string): ParsedStatementRow[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new StatementExtractionError("Couldn't parse this statement — no transaction data found in the response.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new StatementExtractionError("Couldn't parse this statement — malformed response.");
  }
  if (!Array.isArray(parsed)) {
    throw new StatementExtractionError("Couldn't parse this statement — unexpected response shape.");
  }
  return parsed.filter(isValidRow);
}

export async function extractTransactionsFromStatementText(
  statementText: string
): Promise<ParsedStatementRow[]> {
  const prompt = `Here is raw text extracted from a bank statement PDF. Extract every transaction row as a JSON array of objects: [{"date": "YYYY-MM-DD", "description": "...", "amount": number}].

Rules:
- amount is positive for a credit/deposit, negative for a debit/withdrawal.
- Ignore headers, footers, page numbers, account summaries, and lines that only show a running balance with no transaction.
- Normalize every date to YYYY-MM-DD regardless of the format shown in the statement.
- Respond with ONLY the JSON array — no prose, no markdown fences, no explanation.

Statement text:
${statementText}`;

  let text: string;
  try {
    const response = await getClient().messages.create({
      model: "claude-opus-5",
      // 4096 was too small: this model spends part of its output budget on
      // (adaptive) thinking before the visible JSON, so a statement with
      // more than a handful of rows hit stop_reason "max_tokens" and got
      // truncated mid-array with no closing "]" — extractRows then threw
      // "no transaction data found in the response" even though extraction
      // was otherwise working correctly. 20000 is an empirically-chosen
      // value from manual testing against real statements, not a documented
      // Anthropic API limit: 4096 truncated at ~2 rows, while 16000 completed
      // cleanly (stop_reason "end_turn") for one real multi-page, 140-row
      // statement we tested against. This may need retuning if a larger
      // real-world statement truncates again — it stays under the SDK's
      // ~24000 threshold above which it requires streaming for long-running
      // requests (a bigger change out of this task's scope).
      max_tokens: 20000,
      messages: [{ role: "user", content: prompt }],
    });
    text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  } catch {
    throw new StatementExtractionError("Couldn't parse this statement — please try again.");
  }

  return extractRows(text);
}
