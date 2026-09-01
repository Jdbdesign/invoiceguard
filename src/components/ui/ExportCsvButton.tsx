export function ExportCsvButton({ href, label = "Export CSV" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v11m0 0l-3.5-3.5M12 14l3.5-3.5M5 15.5V18a2 2 0 002 2h10a2 2 0 002-2v-2.5"
        />
      </svg>
      {label}
    </a>
  );
}
