"use client";

import { useEffect, useState } from "react";

/** Delays reflecting `value` by `delayMs` — used to avoid firing one API
 * request per keystroke on search inputs. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
