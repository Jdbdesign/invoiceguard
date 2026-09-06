"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { useToast } from "@/context/ToastContext";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;

export function UploadStatementButton() {
  const router = useRouter();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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
    try {
      const blob = await upload(`bank-statements/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/bank-statement",
      });
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
      setUploading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
      >
        {uploading ? "Uploading…" : "Upload bank statement"}
      </button>
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
