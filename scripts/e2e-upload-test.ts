import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/db";
import { extractTransactionsFromStatementText } from "../src/lib/bankStatementExtraction";
import { looksLikeScannedPdf } from "../src/lib/pdfValidation";
import { fromIsoDate } from "../src/lib/dateSerialization";

const SCRATCH = "C:/Users/HP/AppData/Local/Temp/claude/c--Users-HP-Downloads-ARAP-agentic-tool/07ac03a8-4f91-4eba-8e61-f570ea6feedc/scratchpad";
const PDF_PATH = path.join(SCRATCH, "pdfs", "statement.pdf");

const TEST_EMAIL = `e2e-haiku-eval-${Date.now()}@invoiceguard.local`;

async function main() {
  console.error("Step 1: creating isolated test owner...");
  const user = await prisma.user.create({
    data: { email: TEST_EMAIL, passwordHash: "not-a-real-hash-e2e-test-fixture" },
  });

  try {
    console.error("Step 2: parsing PDF with pdf-parse (same import path as the route)...");
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const buffer = fs.readFileSync(PDF_PATH);
    const data = await pdfParse(buffer);
    console.error(`  ${data.numpages} pages, ${data.text.length} chars`);

    if (looksLikeScannedPdf(data.text, data.numpages)) {
      throw new Error("looksLikeScannedPdf flagged this statement — unexpected, aborting");
    }

    console.error("Step 3: running the REAL extractTransactionsFromStatementText (now claude-haiku-4-5)...");
    const rows = await extractTransactionsFromStatementText(data.text);
    console.error(`  extracted ${rows.length} rows`);

    console.error("Step 4: creating BankStatementUpload (mirrors POST /api/bank-statements end state)...");
    const upload = await prisma.bankStatementUpload.create({
      data: {
        ownerId: user.id,
        fileUrl: "https://e2e-test.public.blob.vercel-storage.com/fake-fixture.pdf",
        fileName: "OLAYINKA ISAIAH JACOBS_8164665220_statement.pdf",
        status: "needs_review",
        parsedRowsJson: rows as unknown as object,
      },
    });

    console.error("Step 5: simulating PATCH /api/bank-statements/[id] review-confirm (exact same dedup + createMany logic)...");
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.bankStatementUpload.updateMany({
        where: { id: upload.id, ownerId: user.id, status: "needs_review" },
        data: { status: "reviewed", reviewedAt: new Date() },
      });
      if (count === 0) throw new Error("unexpected: upload already reviewed");

      const existing = await tx.bankTransaction.findMany({
        where: {
          ownerId: user.id,
          OR: rows.map((row) => ({
            date: fromIsoDate(row.date),
            description: row.description,
            amount: row.amount,
          })),
        },
        select: { date: true, description: true, amount: true },
      });
      const existingKeys = new Set(existing.map((e) => `${e.date.toISOString()}|${e.description}|${e.amount}`));
      const newRows = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !existingKeys.has(`${fromIsoDate(row.date).toISOString()}|${row.description}|${row.amount}`));

      if (newRows.length > 0) {
        await tx.bankTransaction.createMany({
          data: newRows.map(({ row, index }) => ({
            uploadId: upload.id,
            ownerId: user.id,
            date: fromIsoDate(row.date),
            description: row.description,
            amount: row.amount,
            position: index,
          })),
        });
      }
    });

    console.error("Step 6: verifying persisted rows...");
    const persisted = await prisma.bankTransaction.findMany({
      where: { ownerId: user.id },
      orderBy: { position: "asc" },
    });

    console.error(`  persisted ${persisted.length} BankTransaction rows`);

    const owealthWithdrawals = persisted.filter((t) => t.description.includes("OWealth Withdrawal"));
    const negativeWithdrawals = owealthWithdrawals.filter((t) => t.amount < 0);
    const positiveWithdrawals = owealthWithdrawals.filter((t) => t.amount >= 0);

    console.error(`  OWealth Withdrawal rows: ${owealthWithdrawals.length} (negative: ${negativeWithdrawals.length}, positive/zero: ${positiveWithdrawals.length})`);

    const byType = new Map<string, { count: number; negCount: number; posCount: number }>();
    for (const t of persisted) {
      const key = t.description.includes("OWealth Withdrawal")
        ? "OWealth Withdrawal"
        : t.description.includes("OWealth Interest Earned")
          ? "OWealth Interest Earned"
          : t.description.includes("Auto-save to OWealth")
            ? "Auto-save to OWealth Balance"
            : t.description.includes("Transfer to")
              ? "Transfer to (outgoing)"
              : t.description.includes("Transfer from") || t.description.startsWith("Received")
                ? "Transfer from / Received (incoming)"
                : "OTHER: " + t.description.slice(0, 40);
      const entry = byType.get(key) ?? { count: 0, negCount: 0, posCount: 0 };
      entry.count++;
      if (t.amount < 0) entry.negCount++;
      else entry.posCount++;
      byType.set(key, entry);
    }
    console.error("\n  Breakdown by transaction type (count / negative / positive):");
    for (const [key, v] of [...byType.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.error(`    ${key}: ${v.count} total, ${v.negCount} negative, ${v.posCount} positive`);
    }

    const result = {
      totalRows: persisted.length,
      owealthWithdrawalCount: owealthWithdrawals.length,
      owealthWithdrawalAllNegative: positiveWithdrawals.length === 0,
      byType: Object.fromEntries(byType),
    };
    fs.writeFileSync(path.join(SCRATCH, "results", "e2e-verification.json"), JSON.stringify(result, null, 2));

    console.error(`\n${result.owealthWithdrawalAllNegative ? "PASS" : "FAIL"}: all OWealth Withdrawal rows negative`);
  } finally {
    console.error("\nStep 7: cleaning up test fixtures...");
    await prisma.bankTransaction.deleteMany({ where: { ownerId: user.id } });
    await prisma.bankStatementUpload.deleteMany({ where: { ownerId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.error("  cleanup complete — no residual rows for this test owner");
  }
}

main()
  .catch((e) => {
    console.error("E2E TEST FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
