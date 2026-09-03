import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapActivity, mapInvoice } from "@/lib/mappers";
import { auth } from "@/auth";
import { sendPaymentReceipt } from "@/lib/receipts";
import { INVOICE_ITEMS_INCLUDE } from "@/lib/invoiceItems";
import { getOrCreateSettings } from "@/lib/settings";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceNumber: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invoiceNumber } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber, client: { ownerId: session.user.id } },
    include: { client: true, items: INVOICE_ITEMS_INCLUDE },
  });
  if (!invoice) {
    return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  }
  if (invoice.status !== "paid") {
    return NextResponse.json(
      { error: "invoice must be fully paid before a receipt can be sent" },
      { status: 400 }
    );
  }
  if (invoice.receiptSentAt) {
    return NextResponse.json(
      { error: "a receipt has already been sent for this invoice" },
      { status: 400 }
    );
  }

  const settings = await getOrCreateSettings(session.user.id);
  const result = await sendPaymentReceipt(invoice, settings.activeReceiptTemplateId);
  if (!result) {
    return NextResponse.json({ error: "failed to send receipt email" }, { status: 502 });
  }

  return NextResponse.json({
    invoice: mapInvoice(result.invoice),
    activity: mapActivity(result.activity),
  });
}
