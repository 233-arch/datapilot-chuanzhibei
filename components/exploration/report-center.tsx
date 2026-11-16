"use client";
import { useMemo } from "react";
import { ArrowRight, BarChart3, Check, Download, Eye, FileText, ListChecks } from "lucide-react";
import { executePlan, filtersForPlan, type Dataset, type Plan, type Profile } from "@/lib/data-engine";
import { REPORT_ANALYSIS_LIMIT, type ReportAnalysis } from "@/lib/report-bundle";
import type { BusinessRule } from "@/lib/business-rules";
import { ReportQuality } from "./report-quality";
import { ReportDraftEditor, ReportNotes } from "./report-draft-editor";
import type { ReportDraft } from "@/lib/report-draft";

const sourceNames = { current: "当前图表", pin: "收藏洞察", history: "分析记录" };
export function ReportCenter({ dataset, profile, items, selected, rules, onToggle, onSelectAll, onPreview, onExport, onReview, onOpen, onEvidence, draft, basis, saved, onDraft, onPresent }: {
  draft: ReportDraft; basis: string; saved: boolean; onDraft: (patch: Partial<ReportDraft>) => void; onPresent: () => void;
  dataset: Dataset; profile: Profile; items: ReportAnalysis[]; selected: ReportAnalysis[]; rules: BusinessRule[];
  onToggle: (key: string) => void; onSelectAll: (all: boolean) => void; onPreview: () => void; onExport: () => void; onReview: () => void;
  onOpen: (plan: Plan) => void; onEvidence: (plan: Plan) => void;
}) {
  const selectedKeys = new Set(selected.map(item => item.key));
  const results = useMemo(() => items.map(item => {
    try { return { item, result: executePlan(dataset, profile, item.plan), error: "" }; }
    catch { return { item, result: null, error: "此分析的字段或口径已不适用，请取消勾选并重新分析。" }; }
  }), [items, dataset, profile]);
  const invalid = results.some(({ item, error }) => selectedKeys.has(item.key) && error);
  const exportDisabled = !selected.length || invalid;
  return <div className="report-center">
    <section className="report-cover" aria-labelledby="report-composer-title">
      <div className="report-cover-copy"><span className="report-kicker"><FileText size={17} />报告编排</span><h2 id="report-composer-title">让分析成为可交付的报告</h2><p>编排图表与发现，核验数据来源，导出可离线阅读的分析成果。</p><div className="report-cover-actions"><button className="button primary" disabled={exportDisabled} onClick={onPreview}><Eye size={17} />预览报告</button><button className="button subtle" disabled={exportDisabled} onClick={onExport}><Download size={17} />导出与复现</button></div></div>
      <div className="report-cover-sheet" aria-label="当前报告组成"><span>本次报告</span><strong>{selected.length}<small>项分析</small></strong><div><ListChecks size={17} /><span>{rules.length ? `${rules.length} 条业务规则核验` : "业务规则尚未配置"}</span></div><div><BarChart3 size={17} /><span>图表 · 数据表 · 计算口径</span></div><div><Check size={17} /><span>导出时按当前数据重新计算</span></div></div>
    </section>
    <ReportDraftEditor draft={draft} basis={basis} saved={saved} disabled={exportDisabled} onChange={onDraft} onPresent={onPresent} />
    <ReportQuality dataset={dataset} rules={rules} onReview={onReview} />
    <section className="report-composition" aria-labelledby="report-items-title"><header><div><h2 id="report-items-title">选择报告内容 <span>{selected.length} / {items.length}</span></h2><p>当前图表、收藏和分析记录自动合并重复项；每项保留自己的筛选范围。</p></div><div className="report-selection-actions"><button className="button subtle" onClick={() => onSelectAll(true)}>选择{items.length > REPORT_ANALYSIS_LIMIT ? "前 30 项" : "全部"}</button><button className="button subtle" disabled={!selected.length} onClick={() => onSelectAll(false)}>取消全部</button></div></header>
      <p className="report-selection-status" role="status">{invalid ? "有选中的分析无法计算，请取消该项或重新分析后导出。" : selected.length ? `已选 ${selected.length} 项，将同时用于 HTML 和 Markdown 报告。` : "尚未选择分析，请勾选至少一项再预览或导出。"}{items.length > REPORT_ANALYSIS_LIMIT && " 每份报告最多 30 项，可先取消已选项再加入其他分析。"}</p>
      <div className="report-insight-list">{results.map(({ item, result, error }, index) => {
        const checked = selectedKeys.has(item.key);
        const filters = filtersForPlan(item.plan);
        return <article key={item.key} className={`report-insight ${checked ? "included" : ""}`}>
          <label className="report-checkbox"><input type="checkbox" checked={checked} disabled={!checked && selected.length >= REPORT_ANALYSIS_LIMIT} aria-label={`纳入报告：${item.plan.title}`} onChange={() => onToggle(item.key)} /><span>{String(index + 1).padStart(2, "0")}</span></label>
          <div className="report-insight-body"><div className="report-insight-tags">{item.sources.map(source => <span key={source}>{sourceNames[source]}</span>)}<span>{item.mode === "model" ? "模型规划 · 本地复算" : "本地计算"}</span></div><h3>{item.plan.title}</h3><p>{error || result?.summary}</p>{item.note && <blockquote>{item.note}</blockquote>}
            <div className="report-insight-facts"><span>{item.plan.aggregate === "count" ? "记录数" : item.plan.metric} · 按{item.plan.groupBy}</span><span>{result ? `${result.validRows.toLocaleString()} 条有效 / ${result.matchedRows.toLocaleString()} 条匹配` : "无法计算"}</span><span>{filters.length ? `${filters.length} 项筛选条件` : "全部记录"}</span></div>
            {filters.length > 0 && <details><summary>查看筛选条件</summary><ul>{filters.map((filter, i) => <li key={i}>{filter.field} · {({ eq: "等于", contains: "包含", gte: "不小于 / 起始", lte: "不大于 / 截止", missing: "为空", bucket: "时间分组", group: "图表分组" })[filter.operator]} · {String(filter.value ?? "")}</li>)}</ul></details>}
            <ReportNotes title={item.plan.title} note={draft.notes[item.key]} onChange={note => onDraft({ notes: { ...draft.notes, [item.key]: note } })}
              up={index > 0 ? () => { const order = items.map(i => i.key); [order[index-1], order[index]] = [order[index], order[index-1]]; onDraft({ order }); } : undefined}
              down={index < items.length - 1 ? () => { const order = items.map(i => i.key); [order[index+1], order[index]] = [order[index], order[index+1]]; onDraft({ order }); } : undefined} />
            <div className="report-insight-actions"><button disabled={!!error} onClick={() => onOpen(item.plan)}>打开图表<ArrowRight size={15} /></button><button disabled={!!error} onClick={() => onEvidence(item.plan)}>核对来源记录<Eye size={15} /></button></div>
          </div>
        </article>;
      })}</div>
    </section>
    <div className="report-bottom-note"><Check size={18} /><p>勾选仅控制这次报告的内容，不删除分析记录。标题、章节顺序、说明与勾选会自动保存在当前项目中，也会包含在项目备份中。</p></div>
  </div>;
}
