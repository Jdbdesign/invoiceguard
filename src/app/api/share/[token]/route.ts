import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapClient, mapInvoice, mapPaymentPlan } from "@/lib/mappers";
import { resolveShareLink } from "@/lib/shareLink";

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
    client: mapClient(client),
    invoices: invoices.map(mapInvoice),
    paymentPlans: paymentPlans.map(mapPaymentPlan),
  });
}
