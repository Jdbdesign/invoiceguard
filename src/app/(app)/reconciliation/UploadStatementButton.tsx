"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { useToast } from "@/context/ToastContext";
import { Spinner } from "@/components/ui/Spinner";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;
// POST /api/bank-statements is one opaque request (download, parse, then a
// Claude call) with no server-sent progress, so this is a time-based guess
// at when parsing gives way to the AI extraction step, not a real signal.
const ANALYZING_LABEL_DELAY_MS = 2000;

export function UploadStatementButton() {
  const router = useRouter();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("File must be smaller than 15MB.");
      return;
    }

    setError(null);
    setUploading(true);
    setStatusLabel("Uploading…");
    let analyzingLabelTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const blob = await upload(`bank-statements/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/bank-statement",
        onUploadProgress: (event) => {
          setStatusLabel(`Uploading… ${Math.round(event.percentage)}%`);
        },
      });

      setStatusLabel("Reading PDF…");
      analyzingLabelTimer = setTimeout(() => {
        setStatusLabel("Analyzing transactions with AI…");
      }, ANALYZING_LABEL_DELAY_MS);

      const response = await fetch("/api/bank-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: blob.url, fileName: file.name }),
      });
      const data = await response.json();
      if (data.upload.status === "failed") {
        const message = data.upload.errorMessage ?? "Couldn't process this statement.";
        setError(message);
        showToast(message);
        return;
      }
      router.push(`/reconciliation/${data.upload.id}/review`);
    } catch {
      const message = "Upload failed — try again.";
      setError(message);
      showToast(message);
    } finally {
      clearTimeout(analyzingLabelTimer);
      setUploading(false);
      setStatusLabel(null);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
      >
        {uploading && <Spinner className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : "Upload bank statement"}
      </button>
      {uploading && statusLabel && (
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="h-3.5 w-3.5 text-slate-400" />
          {statusLabel}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
