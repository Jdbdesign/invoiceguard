export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  loading = false,
  itemLabel = "results",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  itemLabel?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 sm:flex-row">
      <p className="text-xs text-slate-500">
        {total === 0 ? `No ${itemLabel}` : `Showing ${start}–${end} of ${total} ${itemLabel}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="min-w-[5.5rem] text-center text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
