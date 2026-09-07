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
  const { showToast, showProgressToast, updateProgressToast, dismissToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      showToast("Please upload a PDF file.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      showToast("File must be smaller than 15MB.");
      return;
    }

    setUploading(true);
    // One toast, updated in place as the upload moves through its steps —
    // not a new toast per step — so this never stacks up, and (like the
    // inline status text it replaces) never shifts the buttons next to it.
    const progressToastId = showProgressToast("Uploading…");
    let analyzingLabelTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const blob = await upload(`bank-statements/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/bank-statement",
        onUploadProgress: (event) => {
          updateProgressToast(progressToastId, `Uploading… ${Math.round(event.percentage)}%`);
        },
      });

      updateProgressToast(progressToastId, "Reading PDF…");
      analyzingLabelTimer = setTimeout(() => {
        updateProgressToast(progressToastId, "Analyzing transactions with AI…");
      }, ANALYZING_LABEL_DELAY_MS);

      const response = await fetch("/api/bank-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: blob.url, fileName: file.name }),
      });
      const data = await response.json();
      if (data.upload.status === "failed") {
        showToast(data.upload.errorMessage ?? "Couldn't process this statement.");
        return;
      }
      router.push(`/reconciliation/${data.upload.id}/review`);
    } catch {
      showToast("Upload failed — try again.");
    } finally {
      clearTimeout(analyzingLabelTimer);
      dismissToast(progressToastId);
      setUploading(false);
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
