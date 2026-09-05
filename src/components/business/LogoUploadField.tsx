"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function LogoUploadField({
  logoUrl,
  businessName,
  onUploaded,
  theme = "light",
}: {
  logoUrl: string | null;
  businessName: string;
  onUploaded: (url: string) => void;
  theme?: "light" | "dark";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Logo must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("Logo must be smaller than 2MB.");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const blob = await upload(`logos/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/logo",
      });
      onUploaded(blob.url);
    } catch {
      setError("Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  const badgeClasses =
    theme === "dark"
      ? "border-[#007ACC]/50 bg-[#131313] text-white hover:border-[#007ACC] hover:bg-[#007ACC]/10"
      : "border-blue-300 bg-slate-50 text-slate-600 hover:border-blue-500 hover:bg-blue-50";
  const overlayClasses =
    theme === "dark" ? "border-[#141414] bg-[#007ACC]" : "border-white bg-blue-600";
  const labelClasses =
    theme === "dark"
      ? "text-[#9A9A9A] hover:text-white"
      : "text-slate-500 hover:text-slate-900";
  const hintClasses = theme === "dark" ? "text-[#6E6E6E]" : "text-slate-400";

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label={logoUrl ? "Change logo" : "Upload logo"}
        className={`relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed text-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${badgeClasses}`}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local static asset
          <img src={logoUrl} alt={businessName || "Logo"} className="h-full w-full object-cover" />
        ) : (
          (businessName || "?").charAt(0).toUpperCase()
        )}
        <span
          className={`absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 ${overlayClasses}`}
        >
          <svg
            className="h-2.5 w-2.5 text-white"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 8h2.5l1.5-2h8l1.5 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
            />
            <circle cx="12" cy="13.5" r="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${labelClasses}`}
        >
          {uploading ? "Uploading…" : logoUrl ? "Change logo" : "Add your logo"}
        </button>
        <p className={`mt-0.5 text-[11px] ${hintClasses}`}>PNG, JPG, or WebP — up to 2MB</p>
        {error && <p className="mt-1 text-xs font-medium text-rose-400">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
