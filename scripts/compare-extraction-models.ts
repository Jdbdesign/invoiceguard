import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const SCRATCH = "C:/Users/HP/AppData/Local/Temp/claude/c--Users-HP-Downloads-ARAP-agentic-tool/07ac03a8-4f91-4eba-8e61-f570ea6feedc/scratchpad";
const PDF_DIR = path.join(SCRATCH, "pdfs");
const RESULTS_DIR = path.join(SCRATCH, "results");

const MODELS = ["claude-opus-5", "claude-haiku-4-5"] as const;

const client = new Anthropic();

// Mirrors extractRows() in src/lib/bankStatementExtraction.ts exactly.
function extractRows(text: string) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    return { error: "no-json-array-found", raw: text };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { error: "malformed-json", raw: text };
  }
  if (!Array.isArray(parsed)) {
    return { error: "not-an-array", raw: text };
  }
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isValidRow(row: unknown): boolean {
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
  const dropped = parsed.length - valid.length;
  return { rows: valid, droppedCount: dropped, totalParsed: parsed.length };
}

// Mirrors the prompt in extractTransactionsFromStatementText() exactly.
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

async function extractWithModel(model: string, statementText: string) {
  const response = await client.messages.create({
    model,
    max_tokens: 20000,
    messages: [{ role: "user", content: buildPrompt(statementText) }],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
  return { text, stopReason: response.stop_reason, usage: response.usage, parsed: extractRows(text) };
}

async function main() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const files = fs.readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));

  for (const file of files) {
    const buffer = fs.readFileSync(path.join(PDF_DIR, file));
    const data = await pdfParse(buffer);
    const statementText = data.text;
    console.error(`\n=== ${file} (${data.numpages} pages, ${statementText.length} chars extracted) ===`);

    const fileResults: Record<string, unknown> = { file, pageCount: data.numpages, extractedTextLength: statementText.length };

    for (const model of MODELS) {
      console.error(`  running ${model}...`);
      try {
        const result = await extractWithModel(model, statementText);
        fileResults[model] = result;
        const rowCount = "rows" in result.parsed ? result.parsed.rows.length : 0;
        console.error(`    ${model}: stop_reason=${result.stopReason} rows=${rowCount}`);
      } catch (err) {
        fileResults[model] = { error: String(err) };
        console.error(`    ${model}: ERROR ${String(err)}`);
      }
    }

    const outPath = path.join(RESULTS_DIR, `${file.replace(/\.pdf$/i, "")}.json`);
    fs.writeFileSync(outPath, JSON.stringify(fileResults, null, 2));
    console.error(`  wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
