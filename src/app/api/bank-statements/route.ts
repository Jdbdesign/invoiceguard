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

  let parsedFileUrl: URL | null;
  try {
    parsedFileUrl = new URL(fileUrl);
  } catch {
    parsedFileUrl = null;
  }
  if (
    !parsedFileUrl ||
    parsedFileUrl.protocol !== "https:" ||
    !parsedFileUrl.hostname.endsWith(".public.blob.vercel-storage.com")
  ) {
    console.error("Rejected fileUrl — unexpected host", parsedFileUrl?.hostname ?? "(unparseable)");
    return fail("This file doesn't appear to be a valid upload — please try again.");
  }

  let fileResponse: Response;
  try {
    fileResponse = await fetch(fileUrl);
  } catch (error) {
    console.error("Bank statement file download failed", error);
    return fail("Couldn't download the uploaded file — please try again.");
  }
  if (!fileResponse.ok) {
    return fail("Couldn't download the uploaded file — please try again.");
  }

  // Check the declared size before buffering the body into memory — fileUrl
  // only has to satisfy the hostname allowlist above, so without this an
  // authenticated user could point it at an arbitrarily large blob and force
  // this function to buffer all of it before the size check below ever runs.
  const contentLength = Number(fileResponse.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SIZE_BYTES) {
    return fail("This file is larger than the 15MB limit.");
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Backstop for a missing or lying Content-Length header — defense in
  // depth, not a replacement for the pre-read check above.
  if (buffer.length > MAX_SIZE_BYTES) {
    return fail("This file is larger than the 15MB limit.");
  }
  if (!isPdfBuffer(buffer)) {
    return fail("This file doesn't appear to be a valid PDF.");
  }

  const { PDFParse, PasswordException, InvalidPDFException, FormatError, UnknownErrorException } =
    await import("pdf-parse");
  // pdfjs-dist (which pdf-parse wraps) auto-locates its worker script relative
  // to its own bundled module location — a lookup that breaks once Turbopack/
  // webpack bundle it into a chunk without the sibling pdf.worker.mjs file
  // ("Setting up fake worker failed: Cannot find module ...pdf.worker.mjs").
  // Pointing it at the real on-disk worker via pdf-parse's own `/worker`
  // export sidesteps that bundling gap. See next.config.ts's
  // `serverExternalPackages` for the other half of this fix.
  const { getPath } = await import("pdf-parse/worker");
  PDFParse.setWorker(getPath());
  let extractedText: string;
  let pageCount: number;
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    extractedText = result.text;
    pageCount = result.total;
  } catch (error) {
    console.error("Bank statement PDF parsing failed", error);
    if (error instanceof PasswordException) {
      return fail("This PDF is password-protected — please upload an unprotected statement export.");
    }
    if (error instanceof InvalidPDFException || error instanceof FormatError) {
      return fail("Couldn't read this PDF — it may be corrupted.");
    }
    if (error instanceof UnknownErrorException) {
      return fail("Couldn't read this PDF — please try re-exporting it and uploading again.");
    }
    return fail("Couldn't read this PDF — it may be corrupted.");
  } finally {
    await parser.destroy();
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
    console.error("Bank statement transaction extraction failed", error);
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
