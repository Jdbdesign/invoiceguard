import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClient } from "@/lib/mappers";
import { CURRENCIES, DEFAULT_CURRENCY, daysBetween, todayIso } from "@/lib/utils";
import { toIsoDate } from "@/lib/dateSerialization";
import { parsePaginationParams } from "@/lib/pagination";
import { auth } from "@/auth";
import type { ClientListItem } from "@/lib/types";

const VALID_CURRENCIES = new Set(CURRENCIES.map((c) => c.code));

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = session.user.id;
  const { searchParams } = new URL(request.url);
  const pagination = parsePaginationParams(searchParams);

  if (!pagination) {
    const clients = await prisma.client.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(clients.map(mapClient));
  }

  const [allClients, unpaidInvoices, unpaidInstallments] = await Promise.all([
    prisma.client.findMany({ where: { ownerId } }),
    prisma.invoice.findMany({
      where: { status: { not: "paid" }, client: { ownerId } },
      select: { invoiceNumber: true, clientId: true, dueDate: true, balance: true },
    }),
    prisma.installment.findMany({
      where: { status: { not: "paid" }, paymentPlan: { invoice: { client: { ownerId } } } },
      select: { paymentPlan: { select: { invoice: { select: { clientId: true } } } } },
    }),
  ]);

  const activePlanClientIds = new Set(
    unpaidInstallments.map((i) => i.paymentPlan.invoice.clientId)
  );

  const today = todayIso();
  const totalOwedByClient = new Map<string, number>();
  const oldestOverdueByClient = new Map<
    string,
    { id: string; dueDate: string; daysOverdue: number }
  >();
  const overdueClientIds = new Set<string>();

  for (const inv of unpaidInvoices) {
    totalOwedByClient.set(inv.clientId, (totalOwedByClient.get(inv.clientId) ?? 0) + inv.balance);
    const dueIso = toIsoDate(inv.dueDate);
    const daysOverdue = daysBetween(dueIso, today);
    if (daysOverdue > 0) {
      overdueClientIds.add(inv.clientId);
      const current = oldestOverdueByClient.get(inv.clientId);
      if (!current || daysOverdue > current.daysOverdue) {
        oldestOverdueByClient.set(inv.clientId, {
          id: inv.invoiceNumber,
          dueDate: dueIso,
          daysOverdue,
        });
      }
    }
  }

  const items: ClientListItem[] = allClients.map((c) => {
    const oldest = oldestOverdueByClient.get(c.id);
    const status: ClientListItem["status"] = activePlanClientIds.has(c.id)
      ? "payment_plan"
      : overdueClientIds.has(c.id)
        ? "overdue"
        : "current";
    return {
      ...mapClient(c),
      totalOwed: totalOwedByClient.get(c.id) ?? 0,
      oldestOverdue: oldest ? { id: oldest.id, dueDate: oldest.dueDate } : null,
      status,
    };
  });

  items.sort((a, b) => b.totalOwed - a.totalOwed);

  const total = items.length;
  const start = (pagination.page - 1) * pagination.pageSize;
  const data = items.slice(start, start + pagination.pageSize);

  return NextResponse.json({ data, total, page: pagination.page, pageSize: pagination.pageSize });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const currencyInput = String(body.currency ?? "").trim().toUpperCase();
  const currency = VALID_CURRENCIES.has(currencyInput) ? currencyInput : DEFAULT_CURRENCY;

  if (!name || !email) {
    return NextResponse.json(
      { error: "name and email are required" },
      { status: 400 }
    );
  }

  const client = await prisma.client.create({
    data: { name, email, phone, currency, ownerId: session.user.id },
  });
  return NextResponse.json(mapClient(client), { status: 201 });
}
