import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const SCRATCH = "C:/Users/HP/AppData/Local/Temp/claude/c--Users-HP-Downloads-ARAP-agentic-tool/07ac03a8-4f91-4eba-8e61-f570ea6feedc/scratchpad";
const PDF_DIR = path.join(SCRATCH, "pdfs");
const RESULTS_DIR = path.join(SCRATCH, "results");

const MODELS = ["claude-opus-5", "claude-haiku-4-5"] as const;
const client = new Anthropic();

interface Row {
  date: string;
  description: string;
  amount: number;
}

function extractRows(text: string) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return { error: "no-json-array-found", raw: text };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { error: "malformed-json", raw: text };
  }
  if (!Array.isArray(parsed)) return { error: "not-an-array", raw: text };
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isValidRow(row: unknown): row is Row {
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
  const valid = parsed.filter(isValidRow);
  return { rows: valid, droppedCount: parsed.length - valid.length, totalParsed: parsed.length };
}

function buildPrompt(statementText: string) {
  return `Here is raw text extracted from a bank statement PDF. Extract every transaction row as a JSON array of objects: [{"date": "YYYY-MM-DD", "description": "...", "amount": number}].

Rules:
- amount is positive for a credit/deposit, negative for a debit/withdrawal.
- Ignore headers, footers, page numbers, account summaries, and lines that only show a running balance with no transaction.
- Normalize every date to YYYY-MM-DD regardless of the format shown in the statement.
- Respond with ONLY the JSON array — no prose, no markdown fences, no explanation.

Statement text:
${statementText}`;
}

async function main() {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const buffer = fs.readFileSync(path.join(PDF_DIR, "statement.pdf"));
  const data = await pdfParse(buffer);

  for (const run of [1, 2]) {
    for (const model of MODELS) {
      console.error(`run ${run} / ${model}...`);
      const response = await client.messages.create({
        model,
        max_tokens: 20000,
        messages: [{ role: "user", content: buildPrompt(data.text) }],
      });
      const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      const parsed = extractRows(text);
      const rows = ("rows" in parsed ? parsed.rows : []) ?? [];
      const owealthWithdrawals = rows.filter((r) => r.description.includes("OWealth Withdrawal"));
      const negCount = owealthWithdrawals.filter((r) => r.amount < 0).length;
      const posCount = owealthWithdrawals.filter((r) => r.amount > 0).length;
      console.error(`  ${model} run${run}: total rows=${rows.length}, OWealth Withdrawal rows=${owealthWithdrawals.length}, negative=${negCount}, positive=${posCount}`);
      fs.writeFileSync(
        path.join(RESULTS_DIR, `statement-rerun-${model}-run${run}.json`),
        JSON.stringify({ rows }, null, 2)
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
