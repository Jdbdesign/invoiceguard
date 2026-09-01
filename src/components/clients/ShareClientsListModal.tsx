"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/context/ToastContext";
import { formatDate } from "@/lib/utils";

type ShareLinkSummary = {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastAccessedAt: string | null;
};

type NewLink = { id: string; url: string; expiresAt: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

export function ShareClientsListModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [links, setLinks] = useState<ShareLinkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [justCreated, setJustCreated] = useState<NewLink | null>(null);
  const [revoking, setRevoking] = useState<ShareLinkSummary | null>(null);

  // Reset per-open state without an effect — see ClientFormModal for why
  // this idiom (compare-during-render) is used instead of useEffect here.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setJustCreated(null);
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchJson<ShareLinkSummary[]>("/api/share-links")
      .then((result) => {
        if (cancelled) return;
        setLinks(result);
      })
      .catch(() => {
        if (cancelled) return;
        showToast("Failed to load share links");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const created = await fetchJson<ShareLinkSummary & { url: string }>(
        "/api/share-links",
        { method: "POST" }
      );
      setJustCreated({ id: created.id, url: created.url, expiresAt: created.expiresAt });
      setLinks((prev) => [
        {
          id: created.id,
          createdAt: created.createdAt,
          expiresAt: created.expiresAt,
          lastAccessedAt: created.lastAccessedAt,
        },
        ...prev,
      ]);
    } catch {
      showToast("Failed to generate share link");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(link: ShareLinkSummary) {
    try {
      await fetchJson<{ success: true }>(`/api/share-links/${link.id}`, {
        method: "DELETE",
      });
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      if (justCreated?.id === link.id) setJustCreated(null);
      showToast("Share link revoked");
    } catch {
      showToast("Failed to revoke share link");
    } finally {
      setRevoking(null);
    }
  }

  function handleCopy(url: string) {
    navigator.clipboard
      .writeText(url)
      .then(() => showToast("Link copied"))
      .catch(() => showToast("Failed to copy link"));
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Share clients list">
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Generate a read-only link anyone can open without an account — no edits,
            no deletions, just the client list summary (name, total owed, oldest
            overdue invoice, status). No invoice-level detail or contact info is
            included. Links expire automatically after 30 days, or you can revoke
            one immediately.
          </p>

          {justCreated && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-medium text-emerald-800">
                Link created — copy it now, it won&apos;t be shown again
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={justCreated.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="input flex-1 truncate bg-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(justCreated.url)}
                  className="whitespace-nowrap rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-emerald-700">
                Expires {formatDate(justCreated.expiresAt.slice(0, 10))}
              </p>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Active links
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {generating && <Spinner className="h-3 w-3" />}
                Generate new link
              </button>
            </div>

            {loading ? (
              <p className="py-4 text-center text-sm text-slate-500">Loading…</p>
            ) : links.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
                No active share links for the clients list.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="text-xs text-slate-600">
                      <p>
                        Created {formatDate(link.createdAt.slice(0, 10))} · expires{" "}
                        {formatDate(link.expiresAt.slice(0, 10))}
                      </p>
                      <p className="mt-0.5 text-slate-400">
                        {link.lastAccessedAt
                          ? `Last opened ${formatDate(link.lastAccessedAt.slice(0, 10))}`
                          : "Not opened yet"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRevoking(link)}
                      className="whitespace-nowrap rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title="Revoke share link?"
        message="Anyone with this link will immediately lose access. This can't be undone."
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking) await handleRevoke(revoking);
        }}
      />
    </>
  );
}
