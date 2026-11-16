"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Search } from "lucide-react";

export type WorkspaceAction = {
  id: string;
  title: string;
  description: string;
  keywords?: string;
  icon: ReactNode;
  run: () => void;
};

/** Search only actions that the workspace can actually perform. */
export function WorkspaceSearch({ actions }: { actions: WorkspaceAction[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const options = useRef<(HTMLDivElement | null)[]>([]);
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = actions.filter(action => terms.every(term =>
    `${action.title} ${action.description} ${action.keywords || ""}`.toLocaleLowerCase().includes(term),
  ));
  const selected = Math.min(active, Math.max(0, matches.length - 1));
  useEffect(() => {
    options.current[selected]?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [selected, query]);

  return <div className="workspace-search">
    <div className="workspace-search-input">
      <Search size={20} aria-hidden="true" />
      <input data-autofocus aria-label="搜索功能" placeholder="搜索功能，如：排序、报告、API…"
        role="combobox" aria-expanded="true" aria-autocomplete="list"
        aria-controls={listId} aria-activedescendant={matches.length ? `${listId}-${selected}` : undefined}
        value={query} onChange={event => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (matches.length) setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
          } else if (event.key === "Enter" && matches[selected]) {
            event.preventDefault(); matches[selected].run();
          }
        }} />
    </div>
    <p className="workspace-search-hint">直达工具，保留当前数据与分析范围。</p>
    <div className="workspace-search-results" id={listId} role="listbox" aria-label="可用功能">
      {matches.map((action, index) => <div key={action.id} role="option" id={`${listId}-${index}`} ref={node => { options.current[index] = node; }}
        aria-selected={selected === index} className={`workspace-search-option ${selected === index ? "is-active" : ""}`}
        onClick={action.run}>
          <span className="workspace-search-icon">{action.icon}</span>
          <span><strong>{action.title}</strong><small>{action.description}</small></span>
          <ArrowRight size={17} aria-hidden="true" />
      </div>)}
    </div>
    {!matches.length && <p className="workspace-search-empty" role="status">没有匹配的功能，试试“数据”“诊断”或“报告”。</p>}
    <div className="workspace-search-footer"><span>↑ ↓ 选择 · Enter 打开</span><span>Esc 关闭</span></div>
  </div>;
}
