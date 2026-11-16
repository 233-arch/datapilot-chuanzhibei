"use client";
import { useEffect, useRef, useState } from "react";
import { parseWorkspacePage, type WorkspacePage } from "@/lib/workspace-navigation";

const storageKey = "datapilot:recent-pages:v1";
/** Store navigation IDs only, never questions, data or credentials. */
export function useRecentPages(ready: boolean, current: WorkspacePage) {
  const [recent, setRecent] = useState<WorkspacePage[]>([]);
  const loaded = useRef(false);
  useEffect(() => {
    if (!ready) return;
    let previous = recent;
    if (!loaded.current) {
      loaded.current = true;
      try {
        const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
        previous = Array.isArray(parsed) ? parsed.flatMap(value => {
          const page = typeof value === "string" ? parseWorkspacePage(`#/${value}`) : null;
          return page && page !== "overview" ? [page] : [];
        }) : [];
      } catch { previous = []; }
    }
    const next = [...new Set(current === "overview" ? previous : [current, ...previous])].slice(0, 4);
    if (JSON.stringify(recent) !== JSON.stringify(next)) setRecent(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* In-memory navigation still works when storage is unavailable. */ }
  }, [ready, current, recent]);
  return recent;
}
