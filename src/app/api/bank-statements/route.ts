import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankStatementUpload } from "@/lib/mappers";
import { isPdfBuffer, looksLikeScannedPdf } from "@/lib/pdfValidation";
import { extractTransactionsFromStatementText, StatementExtractionError } from "@/lib/bankStatementExtraction";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;

interface CreateBody {
  fileUrl?: unknown;
  fileName?: unknown;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as CreateBody;
  if (typeof body.fileUrl !== "string" || typeof body.fileName !== "string") {
    return NextResponse.json({ error: "fileUrl and fileName are required" }, { status: 400 });
  }
  const { fileUrl, fileName } = body;

  const upload = await prisma.bankStatementUpload.create({
    data: { ownerId: session.user.id, fileUrl, fileName, status: "parsing" },
  });

  const fail = async (errorMessage: string) => {
    const failed = await prisma.bankStatementUpload.update({
      where: { id: upload.id },
      data: { status: "failed", errorMessage },
    });
    return NextResponse.json({ upload: mapBankStatementUpload(failed) });
  };

  let fileResponse: Response;
  try {
    fileResponse = await fetch(fileUrl);
  } catch {
    return fail("Couldn't download the uploaded file — please try again.");
  }
  if (!fileResponse.ok) {
    return fail("Couldn't download the uploaded file — please try again.");
  }
  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_SIZE_BYTES) {
    return fail("This file is larger than the 15MB limit.");
  }
  if (!isPdfBuffer(buffer)) {
    return fail("This file doesn't appear to be a valid PDF.");
  }

  // NOTE: imports the internal lib entry point rather than the package root.
  // pdf-parse@1.x's index.js runs a top-level debug block guarded by
  // `!module.parent` that is meant to only fire when the package is executed
  // directly (e.g. `node index.js`) for the maintainer's own manual testing.
  // That guard misfires under Next.js's dynamic `import("pdf-parse")` — the
  // ESM/CJS interop path leaves `module.parent` unset — which throws
  // ENOENT trying to read a bundled fixture (`test/data/05-versions-space.pdf`)
  // that isn't present in this project. Importing `pdf-parse/lib/pdf-parse.js`
  // directly reaches the same parsing function without ever loading
  // index.js's debug block. Verified locally: `import("pdf-parse")` reliably
  // crashes with that ENOENT; this import path does not.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  let extractedText: string;
  let pageCount: number;
  try {
    const data = await pdfParse(buffer);
    extractedText = data.text;
    pageCount = data.numpages;
  } catch {
    return fail("Couldn't read this PDF — it may be corrupted.");
  }

  if (looksLikeScannedPdf(extractedText, pageCount)) {
    return fail(
      "This looks like a scanned or image-based PDF, which isn't supported yet — please upload a text-based statement export."
    );
  }

  let rows;
  try {
    rows = await extractTransactionsFromStatementText(extractedText);
  } catch (error) {
    if (error instanceof StatementExtractionError) {
      return fail(error.message);
    }
    return fail("Couldn't parse this statement — please try again.");
  }

  const reviewed = await prisma.bankStatementUpload.update({
    where: { id: upload.id },
    // ParsedStatementRow[] is a plain-data array but doesn't structurally
    // satisfy Prisma's InputJsonValue (which requires an index signature) —
    // this cast is just telling Prisma's Json column type that the array is
    // JSON-serializable, not changing what's actually stored.
    data: { status: "needs_review", parsedRowsJson: rows as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ upload: mapBankStatementUpload(reviewed), rows });
}
