"use client";

import { useEffect, useState } from "react";
import { fetchPaginated } from "./pagination";

/**
 * Fetches one page of a paginated API route. `loading` is derived by
 * comparing the URL actually loaded against the one currently requested,
 * rather than an explicit flag flipped inside the effect — React's
 * lint rules for effects disallow setState as the first synchronous call
 * in an effect body, since it's really just a derivation of "have we
 * settled this request yet".
 *
 * Pass a bumped `reloadToken` to force a refetch of the same URL (e.g.
 * after a mutation elsewhere on the page changes what the current page
 * of results should contain).
 */
export function usePaginatedResource<T>(
  url: string,
  reloadToken: number,
  onError?: (error: unknown) => void
) {
  const requestKey = `${url}::${reloadToken}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPaginated<T>(url)
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setTotal(result.total);
        setLoadedKey(requestKey);
      })
      .catch((error) => {
        if (cancelled) return;
        onError?.(error);
        setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return { data, total, loading: requestKey !== loadedKey };
}
