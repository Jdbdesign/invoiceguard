export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Pagination is opt-in per request: routes that back the shared AppDataContext
 * bulk-load must keep returning a full array when no page params are given.
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaultPageSize = 25,
  maxPageSize = 100
): { page: number; pageSize: number } | null {
  if (!searchParams.has("page") && !searchParams.has("pageSize")) return null;
  const pageRaw = Number(searchParams.get("page"));
  const pageSizeRaw = Number(searchParams.get("pageSize"));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
      ? Math.min(Math.floor(pageSizeRaw), maxPageSize)
      : defaultPageSize;
  return { page, pageSize };
}

export async function fetchPaginated<T>(url: string): Promise<PaginatedResult<T>> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}
