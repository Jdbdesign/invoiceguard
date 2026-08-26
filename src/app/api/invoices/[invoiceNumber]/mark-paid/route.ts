import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapInvoice } from "@/lib/mappers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const { invoiceNumber } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { invoiceNumber } });
  if (!invoice) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json(
      { invoice: mapInvoice(invoice), activity: null },
      { status: 200 }
    );
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "paid", balance: 0 },
  });

  const amountLabel = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(invoice.amount);

  const activity = await prisma.activityLog.create({
    data: {
      clientId: invoice.clientId,
      invoiceId: invoice.id,
      type: "payment_received",
      message: `Invoice ${invoice.invoiceNumber} paid in full — ${amountLabel} received.`,
    },
    include: { invoice: true },
  });

  return NextResponse.json({
    invoice: mapInvoice(updated),
    activity: mapActivity(activity),
  });
}
