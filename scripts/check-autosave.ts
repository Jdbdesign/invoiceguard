import fs from "fs";
import path from "path";

const SCRATCH = "C:/Users/HP/AppData/Local/Temp/claude/c--Users-HP-Downloads-ARAP-agentic-tool/07ac03a8-4f91-4eba-8e61-f570ea6feedc/scratchpad";
const data = JSON.parse(fs.readFileSync(path.join(SCRATCH, "results", "statement.json"), "utf8"));

for (const model of ["claude-opus-5", "claude-haiku-4-5"]) {
  const rows = data[model]?.parsed?.rows ?? [];
  const autosave = rows.filter((r: any) => r.description.includes("Auto-save"));
  const neg = autosave.filter((r: any) => r.amount < 0).length;
  const pos = autosave.filter((r: any) => r.amount >= 0).length;
  console.log(`${model}: ${autosave.length} Auto-save rows, ${neg} negative, ${pos} positive`);
  for (const r of autosave) console.log(`    ${JSON.stringify(r)}`);
}
