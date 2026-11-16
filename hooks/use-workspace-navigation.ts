"use client";
import { useEffect, useRef } from "react";
import { pageFromState, parseWorkspacePage, stateFromPage, workspacePages, type WorkspaceTab, type WorkspaceView } from "@/lib/workspace-navigation";

/** URL fragments keep one shared data workspace mounted; history contains page IDs only. */
export function useWorkspaceNavigation(ready: boolean, view: WorkspaceView, tab: WorkspaceTab, setView: (view: WorkspaceView) => void, setTab: (tab: WorkspaceTab) => void) {
  const initialized = useRef(false);
  const previous = useRef("");
  const incoming = useRef<string | null>(null);
  const page = pageFromState(view, tab);
  const current = useRef(page);
  current.current = page;
  useEffect(() => {
    if (!ready) return;
    const restore = () => {
      const target = parseWorkspacePage(window.location.hash) || "overview";
      const hash = `#/${target}`;
      if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
      previous.current = hash;
      if (target === current.current) return;
      incoming.current = hash;
      const state = stateFromPage(target);
      setView(state.view);
      if (state.tab) setTab(state.tab);
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, [ready, setView, setTab]);
  useEffect(() => {
    if (!ready) return;
    const hash = `#/${page}`;
    if (!initialized.current) {
      initialized.current = true;
      const target = parseWorkspacePage(window.location.hash) || (window.location.hash ? "overview" : null);
      if (target && target !== page) {
        incoming.current = `#/${target}`;
        const state = stateFromPage(target);
        setView(state.view); if (state.tab) setTab(state.tab);
        return;
      }
      window.history.replaceState(null, "", hash);
      previous.current = hash;
      return;
    }
    if (incoming.current) {
      if (incoming.current !== hash) return;
      incoming.current = null;
    } else if (previous.current !== hash) window.history.pushState(null, "", hash);
    if (previous.current !== hash || window.location.hash === hash) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    previous.current = hash;
  }, [ready, page, setView, setTab]);
  useEffect(() => {
    if (!ready) return;
    document.title = `${workspacePages.find(item => item.id === page)!.title} · 数问 DataPilot`;
    const frame = requestAnimationFrame(() => document.getElementById("workspace-page-title")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [ready, page]);
  return page;
}
