"use client";
import { CheckCircle2, Presentation, ArrowUp, ArrowDown } from "lucide-react";
import type { ReportDraft, ReportNote } from "@/lib/report-draft";
export function ReportDraftEditor({ draft, basis, saved, disabled, onChange, onPresent }: { draft: ReportDraft; basis: string; saved: boolean; disabled: boolean; onChange: (patch: Partial<ReportDraft>) => void; onPresent: () => void }) {
  const reviewed = !!draft.reviewedAt && draft.reviewedBasis === basis;
  return <section className="draft-editor product-panel"><div className="draft-editor-top"><div><span className="product-eyebrow">报告草稿</span><h2>为这份分析写下结论</h2></div><span role="status" className="product-hint">{saved ? "草稿已保存在本机" : "草稿尚未保存完成"}</span></div>
    <label className="product-field">报告标题<input maxLength={120} value={draft.title} placeholder="例如：校园消费月度分析" onChange={e => onChange({ title: e.target.value })} /></label>
    <div className={`draft-review ${reviewed ? "reviewed" : ""}`}><div><CheckCircle2 size={18} /><span>{reviewed ? `已人工核验 · ${new Date(draft.reviewedAt).toLocaleString("zh-CN")}` : draft.reviewedAt ? "数据、口径或报告内容有变化，请重新核验。" : "尚未人工核验。请核对各章节图表与来源记录。"}</span></div><button className="button subtle" disabled={disabled || reviewed} onClick={() => onChange({ reviewedBasis: basis, reviewedAt: new Date().toISOString() })}>标记已核验</button></div>
    <button className="button subtle" disabled={disabled} onClick={onPresent}><Presentation size={17} />进入报告演示</button>
  </section>;
}
export function ReportNotes({ note, title, onChange, up, down }: { note?: ReportNote; title: string; onChange: (value: ReportNote) => void; up?: () => void; down?: () => void }) {
  const current = note || { finding: "", evidence: "", recommendation: "" };
  return <details className="report-note-editor"><summary>编辑发现、证据与建议</summary><div className="report-note-fields">{([['finding', '发现'], ['evidence', '证据'], ['recommendation', '建议']] as const).map(([key, label]) => <label className="product-field" key={key}>{label}<textarea aria-label={`${title} · ${label}`} value={current[key]} maxLength={1500} rows={2} onChange={e => onChange({ ...current, [key]: e.target.value })} placeholder={key === "finding" ? "从数据中观察到了什么？" : key === "evidence" ? "引用统计口径、具体数值或来源记录。" : "下一步行动；区分事实与待验证的解释。"} /></label>)}</div><div className="product-actions"><button className="button subtle" disabled={!up} onClick={up}><ArrowUp size={15} />上移章节</button><button className="button subtle" disabled={!down} onClick={down}><ArrowDown size={15} />下移章节</button></div></details>;
}
