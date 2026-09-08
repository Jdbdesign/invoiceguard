import fs from "fs";
import path from "path";

const SCRATCH = "C:/Users/HP/AppData/Local/Temp/claude/c--Users-HP-Downloads-ARAP-agentic-tool/07ac03a8-4f91-4eba-8e61-f570ea6feedc/scratchpad";
const RESULTS_DIR = path.join(SCRATCH, "results");

interface Row {
  date: string;
  description: string;
  amount: number;
}

function normDesc(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

for (const file of fs.readdirSync(RESULTS_DIR)) {
  if (!file.endsWith(".json")) continue;
  const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), "utf8"));
  const opusRows: Row[] = data["claude-opus-5"]?.parsed?.rows ?? [];
  const haikuRows: Row[] = data["claude-haiku-4-5"]?.parsed?.rows ?? [];

  console.log(`\n=== ${data.file} ===`);
  console.log(`opus rows: ${opusRows.length}, haiku rows: ${haikuRows.length}`);

  const maxLen = Math.max(opusRows.length, haikuRows.length);
  let exactMatches = 0;
  let cosmeticDiffs = 0;
  let realDiffs = 0;

  for (let i = 0; i < maxLen; i++) {
    const o = opusRows[i];
    const h = haikuRows[i];
    if (!o || !h) {
      console.log(`  [${i}] MISSING ROW — opus=${JSON.stringify(o)} haiku=${JSON.stringify(h)}`);
      realDiffs++;
      continue;
    }
    const dateMatch = o.date === h.date;
    const amountMatch = o.amount === h.amount;
    const descExactMatch = o.description === h.description;
    const descNormMatch = normDesc(o.description) === normDesc(h.description);

    if (dateMatch && amountMatch && descExactMatch) {
      exactMatches++;
      continue;
    }
    if (dateMatch && amountMatch && descNormMatch) {
      cosmeticDiffs++;
      console.log(`  [${i}] COSMETIC (whitespace only) — opus desc="${o.description}" haiku desc="${h.description}"`);
      continue;
    }
    realDiffs++;
    console.log(`  [${i}] REAL DIFF:`);
    console.log(`      opus:  ${JSON.stringify(o)}`);
    console.log(`      haiku: ${JSON.stringify(h)}`);
  }

  console.log(`  Summary: ${exactMatches} exact, ${cosmeticDiffs} cosmetic, ${realDiffs} real diffs`);
}
