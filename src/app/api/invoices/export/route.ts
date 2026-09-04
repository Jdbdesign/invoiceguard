import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { mapInvoice } from "@/lib/mappers";
import { invoiceStatusLabel } from "@/lib/badgeHelpers";
import { formatCurrency, getInvoiceBalance, getDaysOverdue, todayIso } from "@/lib/utils";
import { toCsv, csvResponse } from "@/lib/csv";
import { INVOICE_ITEMS_INCLUDE } from "@/lib/invoiceItems";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const where = {
    client: { ownerId: session.user.id },
    ...(statusParam && statusParam !== "all" ? { status: statusParam } : {}),
  };

  const rows = await prisma.invoice.findMany({
    where,
    include: {
      client: { select: { name: true, currency: true } },
      items: INVOICE_ITEMS_INCLUDE,
    },
    orderBy: { dueDate: "asc" },
  });

  const csv = toCsv(
    [
      "Invoice Number",
      "Client Name",
      "Description",
      "Amount",
      "Amount Paid",
      "Balance",
      "Currency",
      "Due Date",
      "Days Overdue",
      "Status",
      "Item Breakdown",
    ],
    rows.map((row) => {
      const invoice = mapInvoice(row);
      const overdue = getDaysOverdue(invoice);
      const itemBreakdown = invoice.items
        .map((item) => `${item.description}: ${formatCurrency(item.amount, row.client.currency)}`)
        .join("; ");
      return [
        invoice.id,
        row.client.name,
        invoice.description,
        invoice.amount.toFixed(2),
        invoice.amountPaid.toFixed(2),
        getInvoiceBalance(invoice).toFixed(2),
        row.client.currency,
        invoice.dueDate,
        invoice.status !== "paid" && overdue !== null && overdue > 0 ? overdue : "",
        invoiceStatusLabel(invoice).label,
        itemBreakdown,
      ];
    })
  );

  return csvResponse(`invoices-export-${todayIso()}.csv`, csv);
}
