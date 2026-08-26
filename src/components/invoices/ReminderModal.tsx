"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAppData } from "@/context/AppDataContext";
import { useToast } from "@/context/ToastContext";
import type { ReminderStage } from "@/lib/types";

type Draft = { subject: string; body: string; stage: ReminderStage | null };
type Status = "loading" | "ready" | "sending" | "sent" | "draft-error" | "send-error";

export function ReminderModal({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string | null;
}) {
  const { draftReminder, sendReminder } = useAppData();
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    setStatus("loading");
    setDraft(null);
    setErrorMessage(null);

    draftReminder(invoiceId)
      .then((result) => {
        if (cancelled) return;
        setDraft(result);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to draft reminder"
        );
        setStatus("draft-error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  function handleRetryDraft() {
    if (!invoiceId) return;
    setStatus("loading");
    setErrorMessage(null);
    draftReminder(invoiceId)
      .then((result) => {
        setDraft(result);
        setStatus("ready");
      })
      .catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to draft reminder"
        );
        setStatus("draft-error");
      });
  }

  async function handleSend() {
    if (!invoiceId || !draft) return;
    setStatus("sending");
    setErrorMessage(null);
    try {
      await sendReminder(invoiceId, draft);
      setStatus("sent");
      showToast(`Reminder sent for ${invoiceId}`);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to send reminder"
      );
      setStatus("send-error");
    }
  }

  const busy = status === "sending";

  return (
    <Modal open={open} onClose={onClose} title="Drafted reminder email">
      {status === "loading" && <DraftSkeleton />}

      {status === "draft-error" && (
        <div className="space-y-4">
          <p className="text-sm text-rose-600">{errorMessage}</p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleRetryDraft}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {draft &&
        (status === "ready" ||
          status === "sending" ||
          status === "sent" ||
          status === "send-error") && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-3 border-b border-slate-100 pb-3 text-sm font-medium text-slate-900">
                {draft.subject}
              </p>
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">
                {draft.body}
              </pre>
            </div>

            {status === "send-error" && (
              <p className="text-sm text-rose-600">{errorMessage}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {busy && <Spinner className="h-3.5 w-3.5" />}
                {busy
                  ? "Sending…"
                  : status === "send-error"
                    ? "Retry send"
                    : "Send reminder"}
              </button>
            </div>
          </div>
        )}
    </Modal>
  );
}

function DraftSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 border-b border-slate-100 pb-3">
        <div className="h-4 w-2/3 rounded bg-slate-200" />
      </div>
      <div className="space-y-2.5">
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-11/12 rounded bg-slate-100" />
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-4/5 rounded bg-slate-100" />
        <div className="h-3 w-3/5 rounded bg-slate-100" />
      </div>
    </div>
  );
}
