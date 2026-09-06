import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapBankStatementUpload } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";

interface ReviewRow {
  date?: unknown;
  description?: unknown;
  amount?: unknown;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRows(raw: unknown): { date: string; description: string; amount: number }[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: { date: string; description: string; amount: number }[] = [];
  for (const entry of raw as ReviewRow[]) {
    if (
      typeof entry.date !== "string" ||
      !ISO_DATE_RE.test(entry.date) ||
      typeof entry.description !== "string" ||
      !entry.description.trim() ||
      typeof entry.amount !== "number" ||
      !Number.isFinite(entry.amount)
    ) {
      return null;
    }
    rows.push({ date: entry.date, description: entry.description.trim(), amount: entry.amount });
  }
  return rows;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const upload = await prisma.bankStatementUpload.findFirst({
    where: { id, ownerId: session.user.id },
  });
  if (!upload) return NextResponse.json({ error: "upload not found" }, { status: 404 });

  if (upload.status !== "needs_review") {
    if (upload.status === "reviewed") {
      return NextResponse.json(
        { error: "This statement has already been reviewed." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "This statement isn't ready for review yet." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as { rows?: unknown };
  const rows = parseRows(body.rows);
  if (!rows) {
    return NextResponse.json({ error: "invalid rows" }, { status: 400 });
  }

  const [, updatedUpload] = await prisma.$transaction([
    prisma.bankTransaction.createMany({
      data: rows.map((row, index) => ({
        uploadId: upload.id,
        ownerId: session.user.id,
        date: fromIsoDate(row.date),
        description: row.description,
        amount: row.amount,
        position: index,
      })),
    }),
    prisma.bankStatementUpload.update({
      where: { id: upload.id },
      data: { status: "reviewed", reviewedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ upload: mapBankStatementUpload(updatedUpload) });
}
