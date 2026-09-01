import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getClientListItems } from "@/lib/clientListQuery";
import { clientStatusLabel } from "@/lib/badgeHelpers";
import { toCsv, csvResponse, excelTextField } from "@/lib/csv";
import { todayIso } from "@/lib/utils";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await getClientListItems(session.user.id);

  const csv = toCsv(
    [
      "Name",
      "Email",
      "Phone",
      "Currency",
      "Total Owed",
      "Status",
      "Oldest Overdue Invoice",
      "Oldest Overdue Due Date",
    ],
    items.map((c) => [
      c.name,
      c.email,
      excelTextField(c.phone),
      c.currency,
      c.totalOwed.toFixed(2),
      clientStatusLabel(c.status).label,
      c.oldestOverdue?.id ?? "",
      c.oldestOverdue?.dueDate ?? "",
    ])
  );

  return csvResponse(`clients-export-${todayIso()}.csv`, csv);
}
