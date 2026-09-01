import { prisma } from "@/lib/db";
import { mapClient } from "@/lib/mappers";
import { daysBetween, todayIso } from "@/lib/utils";
import { toIsoDate } from "@/lib/dateSerialization";
import type { ClientListItem } from "@/lib/types";

/**
 * Full, unpaginated list of a user's clients with the same server-computed
 * aggregates (totalOwed/oldestOverdue/status) the paginated /api/clients
 * response uses, sorted by totalOwed desc. Shared by the paginated route and
 * the CSV export route so both stay in sync.
 */
export async function getClientListItems(ownerId: string): Promise<ClientListItem[]> {
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
  return items;
}
