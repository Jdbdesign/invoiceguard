import fs from "fs";
import path from "path";

const SCRATCH = "C:/Users/HP/AppData/Local/Temp/claude/c--Users-HP-Downloads-ARAP-agentic-tool/07ac03a8-4f91-4eba-8e61-f570ea6feedc/scratchpad";
const PDF_DIR = path.join(SCRATCH, "pdfs");

async function main() {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const buffer = fs.readFileSync(path.join(PDF_DIR, "statement.pdf"));
  const data = await pdfParse(buffer);
  fs.writeFileSync(path.join(SCRATCH, "results", "statement-raw-text.txt"), data.text);
  console.log(`wrote raw text, ${data.text.length} chars`);
}

main();
