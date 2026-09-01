import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClient, mapInvoice, mapPaymentPlan } from "@/lib/mappers";
import { resolveShareLink } from "@/lib/shareLink";
import { getClientListItems } from "@/lib/clientListQuery";
import type { SharedClientSummary } from "@/lib/types";

const NOT_FOUND = NextResponse.json(
  { error: "This link is no longer available" },
  { status: 404 }
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const link = await resolveShareLink(token);
  if (!link) return NOT_FOUND;

  if (link.clientId === null) {
    const items = await getClientListItems(link.ownerId);
    const clients: SharedClientSummary[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      currency: item.currency,
      totalOwed: item.totalOwed,
      oldestOverdue: item.oldestOverdue,
      status: item.status,
    }));

    await prisma.shareLink.update({
      where: { id: link.id },
      data: { lastAccessedAt: new Date() },
    });

    return NextResponse.json({ scope: "clients", clients });
  }

  const client = await prisma.client.findUnique({ where: { id: link.clientId } });
  if (!client) return NOT_FOUND;

  const [invoices, paymentPlans] = await Promise.all([
    prisma.invoice.findMany({ where: { clientId: client.id } }),
    prisma.paymentPlan.findMany({
      where: { invoice: { clientId: client.id } },
      include: { invoice: true, installments: true },
    }),
  ]);

  await prisma.shareLink.update({
    where: { id: link.id },
    data: { lastAccessedAt: new Date() },
  });

  return NextResponse.json({
    scope: "client",
    client: mapClient(client),
    invoices: invoices.map(mapInvoice),
    paymentPlans: paymentPlans.map(mapPaymentPlan),
  });
}
