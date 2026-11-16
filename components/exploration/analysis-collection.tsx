"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, BarChart3, Bookmark, Clock3, FileText, PieChart, TrendingUp, Search, X, ChevronDown } from "lucide-react";
import type { Plan } from "@/lib/data-engine";
import type { PinnedInsight } from "@/lib/exploration";
import type { WorkspaceEntry } from "@/lib/workspace-snapshot";

const chartIcons = { bar: BarChart3, line: TrendingUp, pie: PieChart };
const aggregates = { sum: "合计", mean: "平均值", count: "记录数", max: "最大值", min: "最小值" };

export function AnalysisCollection({ current, entries, pins, onOpen, onReport }: {
  current: Plan; entries: WorkspaceEntry[]; pins: PinnedInsight[];
  onOpen: (plan: Plan) => void; onReport: () => void;
}) {
  const [mode, setMode] = useState<"recent" | "saved">("recent");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(4);
  const recentTab = useRef<HTMLButtonElement>(null), savedTab = useRef<HTMLButtonElement>(null);
  const allItems = mode === "recent"
    ? [...entries].reverse().map(entry => ({ id: entry.id, name: entry.question, plan: entry.plan, label: entry.mode === "model" ? "模型辅助" : "本地分析" }))
    : [...pins].reverse().map(pin => ({ id: pin.id, name: pin.name, plan: pin.plan, label: "已收藏" }));
  const term = query.trim().toLocaleLowerCase();
  const matching = allItems.filter(item => [item.name, item.plan.title, item.plan.groupBy, item.plan.metric].some(value => value.toLocaleLowerCase().includes(term)));
  const items = matching.slice(0, visibleCount);
  const changeMode = (next: "recent" | "saved") => { setMode(next); setVisibleCount(4); };
  const CurrentIcon = chartIcons[current.chart] || BarChart3;
  return <section className="analysis-collection" aria-labelledby="analysis-collection-title">
    <header><div><h2 id="analysis-collection-title">我的分析</h2><p>回到已有的发现，继续探索或整理成报告。</p></div><button className="text-button" onClick={onReport}><FileText size={16} />整理报告<ArrowUpRight size={15} /></button></header>
    <button className="collection-current" onClick={() => onOpen(current)}>
      <span className={`collection-type type-${current.chart}`}><CurrentIcon size={21} /></span><span><small>继续当前分析</small><strong>{current.title}</strong></span><ArrowUpRight size={18} />
    </button>
    <div className="collection-tabs" role="tablist" aria-label="分析记录分类" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "recent" : event.key === "End" ? "saved" : mode === "recent" ? "saved" : "recent";
      changeMode(next); (next === "recent" ? recentTab : savedTab).current?.focus();
    }}>
      <button ref={recentTab} tabIndex={mode === "recent" ? 0 : -1} id="analysis-tab-recent" role="tab" aria-controls="analysis-collection-list" aria-selected={mode === "recent"} onClick={() => changeMode("recent")}><Clock3 size={16} />最近分析<span>{entries.length}</span></button>
      <button ref={savedTab} tabIndex={mode === "saved" ? 0 : -1} id="analysis-tab-saved" role="tab" aria-controls="analysis-collection-list" aria-selected={mode === "saved"} onClick={() => changeMode("saved")}><Bookmark size={16} />我的收藏<span>{pins.length}</span></button>
    </div>
    {(entries.length > 0 || pins.length > 0) && <div className="collection-search"><Search size={16} /><input aria-label="搜索我的分析" placeholder="搜索分析名称、维度或指标" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(4); }} />{query && <button aria-label="清空分析搜索" onClick={() => { setQuery(""); setVisibleCount(4); }}><X size={15} /></button>}</div>}
    <div id="analysis-collection-list" role="tabpanel" aria-labelledby={`analysis-tab-${mode}`} tabIndex={0}>
      {term && <p className="collection-search-status" role="status">{mode === "recent" ? "最近分析" : "我的收藏"}中找到 {matching.length} 项</p>}
      {items.length ? <div className="collection-rows">{items.map(item => {
        const Icon = chartIcons[item.plan.chart] || BarChart3;
        return <button key={item.id} className="collection-row" onClick={() => onOpen(item.plan)}>
          <span className={`collection-type type-${item.plan.chart}`}><Icon size={20} /></span><span className="collection-row-copy"><strong>{item.name}</strong><small>{item.plan.groupBy} · {item.plan.aggregate === "count" ? "记录数" : item.plan.metric + aggregates[item.plan.aggregate]}</small></span><span className="collection-kind">{item.label}</span><ArrowUpRight size={17} />
        </button>;
      })}</div> : <div className="collection-empty"><Bookmark size={20} /><p>{term ? "没有匹配的分析。试试其他关键词，或清空搜索。" : mode === "recent" ? "还没有已确认的问答分析。可以从上方的推荐问题开始。" : "收藏常用分析后，在这里一键恢复图表与筛选条件。"}</p></div>}
      {matching.length > visibleCount && <button className="collection-more" onClick={() => setVisibleCount(count => count + 4)}>查看更多分析 · 还有 {matching.length - visibleCount} 项<ChevronDown size={15} /></button>}
    </div>
  </section>;
}
