"use client";

import { useState } from "react";

export function PasswordInput({
  value,
  onChange,
  onBlur,
  placeholder,
  autoFocus,
  "aria-invalid": ariaInvalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  "aria-invalid"?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-300"
      >
        {show ? (
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" strokeWidth={2}>
            <path d="M3 3l18 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
            <path
              d="M10.6 5.2A10.6 10.6 0 0112 5c5.5 0 9.4 4 10.7 7-.5 1.1-1.2 2.2-2.1 3.1m-3.2 2.1A10.7 10.7 0 0112 19c-5.5 0-9.4-4-10.7-7 .6-1.4 1.6-2.8 2.9-4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.9 10c-.4.5-.6 1.1-.6 1.8 0 1.6 1.3 2.9 2.9 2.9.7 0 1.3-.2 1.8-.6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" strokeWidth={2}>
            <path
              d="M1.3 12S5 5 12 5s10.7 7 10.7 7-3.7 7-10.7 7S1.3 12 1.3 12z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="2.9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
