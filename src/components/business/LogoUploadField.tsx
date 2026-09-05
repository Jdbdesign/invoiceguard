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
      ? "border-[#2C2C2C] bg-[#131313] text-white"
      : "border-slate-200 bg-slate-100 text-slate-600";
  const labelClasses =
    theme === "dark"
      ? "text-[#9A9A9A] hover:text-white"
      : "text-slate-500 hover:text-slate-900";

  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-xl font-semibold ${badgeClasses}`}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Blob URL, not a local static asset
          <img src={logoUrl} alt={businessName || "Logo"} className="h-full w-full object-cover" />
        ) : (
          (businessName || "?").charAt(0).toUpperCase()
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${labelClasses}`}
        >
          {uploading ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
        </button>
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
