"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ClientFormModal } from "@/components/clients/ClientFormModal";
import { useAppData } from "@/context/AppDataContext";
import { clientStatusLabel } from "@/lib/badgeHelpers";
import {
  formatCurrency,
  formatDate,
  getClientOldestOverdue,
  getClientStatus,
  getClientTotalOwed,
} from "@/lib/utils";

export default function ClientsPage() {
  const { clients, invoices, paymentPlans } = useAppData();
  const [modalOpen, setModalOpen] = useState(false);

  const rows = clients
    .map((client) => {
      const totalOwed = getClientTotalOwed(client.id, invoices);
      const oldestOverdue = getClientOldestOverdue(client.id, invoices);
      const status = getClientStatus(client.id, invoices, paymentPlans);
      return { client, totalOwed, oldestOverdue, status };
    })
    .sort((a, b) => b.totalOwed - a.totalOwed);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Clients
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {clients.length} clients on file
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Add client
        </button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Total owed</th>
              <th className="px-5 py-3">Oldest overdue invoice</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ client, totalOwed, oldestOverdue, status }) => {
              const badge = clientStatusLabel(status);
              return (
                <tr key={client.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-medium text-slate-900 hover:text-blue-600"
                    >
                      {client.name}
                    </Link>
                    <p className="text-xs text-slate-500">{client.email}</p>
                  </td>
                  <td className="px-5 py-4 font-medium tabular-nums text-slate-900">
                    {formatCurrency(totalOwed)}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {oldestOverdue ? (
                      <>
                        {oldestOverdue.id}
                        <span className="ml-1.5 text-xs text-slate-400">
                          due {formatDate(oldestOverdue.dueDate)}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
