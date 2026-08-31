import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapInvoice } from "@/lib/mappers";
import { fromIsoDate, toIsoDate } from "@/lib/dateSerialization";
import { daysBetween, todayIso } from "@/lib/utils";
import { parsePaginationParams } from "@/lib/pagination";
import { auth } from "@/auth";

type SortKey = "dueDate" | "amount" | "daysOverdue";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = session.user.id;
  const { searchParams } = new URL(request.url);
  const pagination = parsePaginationParams(searchParams);

  if (!pagination) {
    const invoices = await prisma.invoice.findMany({
      where: { client: { ownerId } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(invoices.map(mapInvoice));
  }

  const statusParam = searchParams.get("status");
  const sortParam = (searchParams.get("sort") as SortKey | null) ?? "dueDate";
  const where = {
    client: { ownerId },
    ...(statusParam && statusParam !== "all" ? { status: statusParam } : {}),
  };

  if (sortParam === "daysOverdue") {
    const scalarRows = await prisma.invoice.findMany({
      where,
      select: { id: true, dueDate: true, status: true },
    });
    const today = todayIso();
    const ranked = scalarRows
      .map((r) => ({
        id: r.id,
        sortValue: r.status === "paid" ? -9999 : daysBetween(toIsoDate(r.dueDate), today),
      }))
      .sort((a, b) => b.sortValue - a.sortValue);

    const total = ranked.length;
    const start = (pagination.page - 1) * pagination.pageSize;
    const pageIds = ranked.slice(start, start + pagination.pageSize).map((r) => r.id);

    const rows = await prisma.invoice.findMany({ where: { id: { in: pageIds } } });
    const rowsById = new Map(rows.map((r) => [r.id, r]));
    const ordered = pageIds
      .map((id) => rowsById.get(id))
      .filter((r): r is (typeof rows)[number] => Boolean(r));

    return NextResponse.json({
      data: ordered.map(mapInvoice),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  }

  const orderBy = sortParam === "amount" ? { balance: "desc" as const } : { dueDate: "asc" as const };
  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
  ]);

  return NextResponse.json({
    data: invoices.map(mapInvoice),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });
}

async function generateInvoiceNumber(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `INV-${2300 + Math.floor(Math.random() * 4000)}`;
    const existing = await prisma.invoice.findUnique({
      where: { invoiceNumber: candidate },
    });
    if (!existing) return candidate;
  }
  return `INV-${Date.now()}`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const clientId = String(body.clientId ?? "");
  const amount = Number(body.amount);
  const dueDate = String(body.dueDate ?? "");
  const description = String(body.description ?? "").trim();

  if (!clientId || !Number.isFinite(amount) || amount <= 0 || !dueDate || !description) {
    return NextResponse.json({ error: "invalid invoice input" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, ownerId: session.user.id },
  });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const invoiceNumber = await generateInvoiceNumber();

  const invoice = await prisma.invoice.create({
    data: {
      clientId,
      invoiceNumber,
      description,
      amount,
      balance: amount,
      dueDate: fromIsoDate(dueDate),
      status: "unpaid",
    },
  });

  return NextResponse.json(mapInvoice(invoice), { status: 201 });
}
