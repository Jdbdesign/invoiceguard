"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { useToast } from "@/context/ToastContext";
import { useAppData } from "@/context/AppDataContext";
import { Spinner } from "@/components/ui/Spinner";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;
// POST /api/bank-statements is one opaque request (download, parse, then
// either a pattern-match or a Claude call) with no server-sent progress,
// so this is a time-based guess at when parsing gives way to extraction,
// not a real signal.
const ANALYZING_LABEL_DELAY_MS = 2000;

interface PendingLowConfidence {
  uploadId: string;
  fileUrl: string;
  fileName: string;
  reasons: string[];
}

export function UploadStatementButton() {
  const router = useRouter();
  const { showToast, showProgressToast, updateProgressToast, dismissToast } = useToast();
  const { bankStatementExtractionMethod } = useAppData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingLowConfidence, setPendingLowConfidence] = useState<PendingLowConfidence | null>(null);

  async function submitStatement(fileUrl: string, fileName: string, forceMethod?: "ai") {
    const response = await fetch("/api/bank-statements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileUrl, fileName, ...(forceMethod ? { forceMethod } : {}) }),
    });
    return response.json();
  }

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

    setPendingLowConfidence(null);
    setUploading(true);
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
        updateProgressToast(
          progressToastId,
          bankStatementExtractionMethod === "traditional"
            ? "Parsing transactions…"
            : "Analyzing transactions with AI…"
        );
      }, ANALYZING_LABEL_DELAY_MS);

      const data = await submitStatement(blob.url, file.name);
      if (data.upload.status === "failed") {
        showToast(data.upload.errorMessage ?? "Couldn't process this statement.");
        return;
      }
      if (data.lowConfidenceReasons?.length > 0) {
        setPendingLowConfidence({
          uploadId: data.upload.id,
          fileUrl: blob.url,
          fileName: file.name,
          reasons: data.lowConfidenceReasons,
        });
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

  async function handleRetryWithAi() {
    if (!pendingLowConfidence) return;
    const { fileUrl, fileName } = pendingLowConfidence;
    setUploading(true);
    const progressToastId = showProgressToast("Analyzing transactions with AI…");
    try {
      const data = await submitStatement(fileUrl, fileName, "ai");
      if (data.upload.status === "failed") {
        showToast(data.upload.errorMessage ?? "Couldn't process this statement.");
        return;
      }
      setPendingLowConfidence(null);
      router.push(`/reconciliation/${data.upload.id}/review`);
    } catch {
      showToast("Retry failed — try again.");
    } finally {
      dismissToast(progressToastId);
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      {bankStatementExtractionMethod === "traditional" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Using traditional extraction. This method may misread transactions, especially with
          unusual formats or ambiguous data — please review the parsed results carefully before
          confirming.
        </p>
      )}

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

      {pendingLowConfidence && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">This parse looks unreliable:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {pendingLowConfidence.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleRetryWithAi}
              disabled={uploading}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
            >
              Retry with AI extraction
            </button>
            <button
              type="button"
              onClick={() => {
                router.push(`/reconciliation/${pendingLowConfidence.uploadId}/review`);
                setPendingLowConfidence(null);
              }}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Continue to review anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
