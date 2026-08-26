import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapInvoice } from "@/lib/mappers";
import { formatCurrency } from "@/lib/utils";
import { auth } from "@/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invoiceNumber } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber, client: { ownerId: session.user.id } },
    include: { client: true, paymentPlan: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }
  if (invoice.paymentPlan) {
    return NextResponse.json(
      {
        error:
          "invoice has an active payment plan — use settle-payment-plan to record payment instead",
      },
      { status: 400 }
    );
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

  const amountLabel = formatCurrency(invoice.amount, invoice.client.currency);

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
