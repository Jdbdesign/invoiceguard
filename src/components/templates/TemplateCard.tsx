"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { TemplatePreviewFrame } from "@/components/templates/TemplatePreviewFrame";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";

// Mirrors the "Payment receipts" section on the Settings page: a discrete
// either/or choice where a click is the whole intent, so it selects and
// persists immediately rather than going through a draft + Save flow.
//
// Header, preview, and button stack vertically (rather than the side-by-side
// row CardHeader uses elsewhere) so the card still reads cleanly at the
// ~250-350px widths a multi-column grid puts it at.
export function TemplateCard({
  id,
  name,
  description,
  html,
}: {
  id: string;
  name: string;
  description: string;
  html: string;
}) {
  const { activeReceiptTemplateId, updateActiveReceiptTemplate } = useAppData();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const isActive = id === activeReceiptTemplateId;

  async function handleSelect() {
    if (isActive || saving) return;
    setSaving(true);
    try {
      await updateActiveReceiptTemplate(id);
      showToast(`${name} is now the active receipt template`);
    } catch {
      showToast("Failed to save — see console for details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="border-b border-slate-100 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-900">{name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {isActive ? `${description} · Currently in use` : description}
        </p>
      </div>
      <div className="px-4 py-4">
        <TemplatePreviewFrame html={html} />
      </div>
      <div className="border-t border-slate-100 px-4 py-3">
        <button
          onClick={handleSelect}
          disabled={isActive || saving}
          className={`w-full rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed ${
            isActive
              ? "border-blue-300 bg-blue-50 text-blue-700 disabled:opacity-100"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          }`}
        >
          {isActive ? "Currently in use" : saving ? "Saving…" : "Use this template"}
        </button>
      </div>
    </Card>
  );
}
