"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/context/ToastContext";

interface Row {
  date: string;
  description: string;
  amount: number;
}

export function ReviewRowsEditor({
  uploadId,
  initialRows,
}: {
  uploadId: string;
  initialRows: Row[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, field: keyof Row, value: string) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: field === "amount" ? Number(value) : value } : row
      )
    );
  }

  function deleteRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((prev) => [...prev, { date: "", description: "", amount: 0 }]);
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/bank-statements/${uploadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = data.error ?? "Couldn't save these rows.";
        setError(message);
        showToast(message);
        return;
      }
      router.push("/reconciliation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          title="Parsed transactions"
          subtitle={`${rows.length} row${rows.length === 1 ? "" : "s"} to review`}
          action={
            <button
              type="button"
              onClick={addRow}
              className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              + Add row
            </button>
          }
        />

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No rows left to review — add one, or go back and re-upload the statement.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td className="px-5 py-2.5">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(index, "date", e.target.value)}
                        className="input"
                      />
                    </td>
                    <td className="px-5 py-2.5">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRow(index, "description", e.target.value)}
                        className="input"
                      />
                    </td>
                    <td className="px-5 py-2.5">
                      {/* Width goes on this wrapper, not the .input element
                          itself — see InvoiceFormModal for why a Tailwind
                          width class on .input gets silently overridden. */}
                      <div className="w-32">
                        <input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          onChange={(e) => updateRow(index, "amount", e.target.value)}
                          className="input"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => deleteRow(index)}
                        className="whitespace-nowrap text-xs font-medium text-rose-500 transition hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-rose-500">{error}</p>}

      <div>
        <button
          type="button"
          onClick={confirm}
          disabled={saving || rows.length === 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {saving ? "Saving…" : "Confirm and continue"}
        </button>
      </div>
    </div>
  );
}
