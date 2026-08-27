"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoading } from "@/components/ui/Spinner";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { ClientFormModal } from "@/components/clients/ClientFormModal";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import { clientStatusLabel } from "@/lib/badgeHelpers";
import type { Client } from "@/lib/types";
import {
  formatCurrency,
  formatDate,
  getClientOldestOverdue,
  getClientStatus,
  getClientTotalOwed,
} from "@/lib/utils";

export default function ClientsPage() {
  const { clients, invoices, paymentPlans, deleteClient, loading } = useAppData();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);

  const rows = clients
    .map((client) => {
      const totalOwed = getClientTotalOwed(client.id, invoices);
      const oldestOverdue = getClientOldestOverdue(client.id, invoices);
      const status = getClientStatus(client.id, invoices, paymentPlans);
      return { client, totalOwed, oldestOverdue, status };
    })
    .sort((a, b) => b.totalOwed - a.totalOwed);

  if (loading) {
    return <PageLoading label="Loading clients…" />;
  }

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
        <table className="hidden w-full text-left text-sm md:table">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Total owed</th>
              <th className="px-5 py-3">Oldest overdue invoice</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3" />
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
                    {formatCurrency(totalOwed, client.currency)}
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
                  <td className="px-5 py-4 text-right">
                    <RowActionsMenu
                      onEdit={() => setEditingClient(client)}
                      onDelete={() => setDeletingClient(client)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="divide-y divide-slate-100 md:hidden">
          {rows.map(({ client, totalOwed, oldestOverdue, status }) => {
            const badge = clientStatusLabel(status);
            return (
              <div key={client.id} className="flex items-start justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                  <Link
                    href={`/clients/${client.id}`}
                    className="font-medium text-slate-900 hover:text-blue-600"
                  >
                    {client.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500">{client.email}</p>
                  <p className="mt-2 text-sm font-medium tabular-nums text-slate-900">
                    {formatCurrency(totalOwed, client.currency)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {oldestOverdue ? (
                      <>
                        {oldestOverdue.id}{" "}
                        <span className="text-slate-400">
                          due {formatDate(oldestOverdue.dueDate)}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">No overdue invoices</span>
                    )}
                  </p>
                  <div className="mt-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </div>
                <RowActionsMenu
                  onEdit={() => setEditingClient(client)}
                  onDelete={() => setDeletingClient(client)}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <ClientFormModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <ClientFormModal
        open={editingClient !== null}
        onClose={() => setEditingClient(null)}
        client={editingClient ?? undefined}
      />

      <ConfirmDeleteModal
        open={deletingClient !== null}
        onClose={() => setDeletingClient(null)}
        title="Delete client"
        confirmText={deletingClient?.name ?? ""}
        warning="Deleting this client also permanently deletes all of their invoices, payment plans, and activity history. This cannot be undone."
        onConfirm={async () => {
          if (!deletingClient) return;
          try {
            await deleteClient(deletingClient.id);
            showToast(`${deletingClient.name} deleted`);
            setDeletingClient(null);
          } catch {
            showToast("Failed to delete client");
          }
        }}
      />
    </div>
  );
}
