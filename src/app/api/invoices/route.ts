import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapInvoice } from "@/lib/mappers";
import { fromIsoDate } from "@/lib/dateSerialization";

export async function GET() {
  const invoices = await prisma.invoice.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(invoices.map(mapInvoice));
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
  const body = await request.json();
  const clientId = String(body.clientId ?? "");
  const amount = Number(body.amount);
  const dueDate = String(body.dueDate ?? "");
  const description = String(body.description ?? "").trim();

  if (!clientId || !Number.isFinite(amount) || amount <= 0 || !dueDate || !description) {
    return NextResponse.json({ error: "invalid invoice input" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
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
