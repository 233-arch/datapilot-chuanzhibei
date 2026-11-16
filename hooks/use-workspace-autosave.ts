import { useEffect } from "react";
import { writeWorkspace } from "@/lib/local-store";
import type { WorkspaceSnapshot } from "@/lib/workspace-snapshot";

export function useWorkspaceAutosave(snapshot: WorkspaceSnapshot, ready: boolean, attempt: number, lock: { current: boolean }, onState: (saved: boolean, error?: unknown) => void) {
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    onState(false);
    const timer = setTimeout(() => {
      if (lock.current) return;
      writeWorkspace(snapshot).then(() => { if (alive) onState(true); }).catch(error => { if (alive) onState(false, error); });
    }, 500);
    return () => { alive = false; clearTimeout(timer); };
  }, [snapshot, ready, attempt, lock, onState]);
}
