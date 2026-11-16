"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { executePlan, filtersForPlan, type Dataset, type Profile } from "@/lib/data-engine";
import type { ReportAnalysis } from "@/lib/report-bundle";
import { DataChart } from "./data-chart";
export function ReportPresentation({ title, items, dataset, profile, onClose }: { title: string; items: ReportAnalysis[]; dataset: Dataset; profile: Profile; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), [index, setIndex] = useState(0);
  useEffect(() => { ref.current?.showModal(); }, []);
  const item = items[index];
  if (!item) return null;
  const result = executePlan(dataset, profile, item.plan);
  return <dialog ref={ref} className="report-presentation" aria-label="报告演示" onClose={onClose} onCancel={onClose} onKeyDown={e => { if (e.key === "ArrowRight") { e.preventDefault(); setIndex(n => Math.min(items.length - 1, n + 1)); } if (e.key === "ArrowLeft") { e.preventDefault(); setIndex(n => Math.max(0, n - 1)); } }}>
    <header><div><span className="product-eyebrow">{title || "数问分析报告"}</span><h2>{item.plan.title}</h2></div><button className="icon-button" aria-label="退出报告演示" onClick={onClose}><X /></button></header>
    <div className="presentation-body"><div className="presentation-chart"><DataChart key={item.key} plan={item.plan} result={result} /><p className="product-hint">{filtersForPlan(item.plan).length ? filtersForPlan(item.plan).map(f => `${f.field} ${f.operator} ${f.value}`).join("；") : "全部记录"} · 有效 {result.validRows.toLocaleString()} 条 / 匹配 {result.matchedRows.toLocaleString()} 条</p></div><aside><span className="product-eyebrow">分析结论</span><p>{result.summary}</p>{item.note ? <blockquote>{item.note}</blockquote> : <p className="product-hint">可在报告草稿中补充发现、证据与建议。</p>}</aside></div>
    <footer><span>{index + 1} / {items.length} · 使用左右方向键切换，Esc 退出</span><div className="product-actions"><button className="button subtle" disabled={!index} onClick={() => setIndex(index - 1)}><ChevronLeft size={18} />上一节</button><button className="button primary" disabled={index === items.length - 1} onClick={() => setIndex(index + 1)}>下一节<ChevronRight size={18} /></button></div></footer>
  </dialog>;
}
