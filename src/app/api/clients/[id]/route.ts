import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClient } from "@/lib/mappers";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/utils";
import { auth } from "@/auth";

const VALID_CURRENCIES = new Set(CURRENCIES.map((c) => c.code));

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
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

  const existing = await prisma.client.findFirst({
    where: { id, ownerId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const client = await prisma.client.update({
    where: { id },
    data: { name, email, phone, currency },
  });
  return NextResponse.json(mapClient(client));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, ownerId: session.user.id },
    include: { invoices: { include: { paymentPlan: true } } },
  });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const paymentPlanIds = client.invoices
    .map((inv) => inv.paymentPlan?.id)
    .filter((planId): planId is string => Boolean(planId));
  const invoiceIds = client.invoices.map((inv) => inv.id);

  await prisma.$transaction([
    ...(paymentPlanIds.length > 0
      ? [
          prisma.installment.deleteMany({
            where: { paymentPlanId: { in: paymentPlanIds } },
          }),
          prisma.paymentPlan.deleteMany({
            where: { id: { in: paymentPlanIds } },
          }),
        ]
      : []),
    prisma.activityLog.deleteMany({ where: { clientId: id } }),
    ...(invoiceIds.length > 0
      ? [prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } })]
      : []),
    prisma.client.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
