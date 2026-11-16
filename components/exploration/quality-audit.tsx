"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FileSearch, X } from "lucide-react";
import { type Dataset, type Profile } from "@/lib/data-engine";
import { auditQuality, issueLabels, qualityIssueExport, QUALITY_EXPORT_LIMIT, type IssueKind } from "@/lib/quality-audit";

export function QualityAudit({ dataset, profile, onExport }: { dataset: Dataset; profile: Profile; onExport: (data: Dataset) => void }) {
  const [kind, setKind] = useState<IssueKind | "">("");
  const [field, setField] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const recordPanel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected !== null) recordPanel.current?.focus(); }, [selected]);
  const query = useMemo(() => ({ kind: kind || undefined, field: field || undefined }), [kind, field]);
  const audit = useMemo(() => auditQuality(dataset, profile, query), [dataset, profile, query]);
  const pages = Math.max(1, Math.ceil(audit.samples.length / 10));
  const current = Math.min(page, pages - 1);
  const row = selected === null ? null : dataset.rows[selected - 1];
  const reset = () => { setPage(0); setSelected(null); setStatus(""); };
  return <section className="quality-audit chart-card" aria-labelledby="quality-audit-title">
    <header className="card-heading"><div><h3 id="quality-audit-title" tabIndex={-1}><FileSearch size={20} />问题记录定位</h3><p>检查整个数据集，不受分析筛选影响。记录序号从 1 开始，不含表头。</p></div>
      <button className="button subtle" disabled={!audit.total || audit.total > QUALITY_EXPORT_LIMIT} onClick={() => { try { onExport(qualityIssueExport(dataset, profile, query)); setStatus(`已生成 ${audit.total.toLocaleString()} 项问题清单，请查看浏览器下载。`); } catch (error) { setStatus(error instanceof Error ? error.message : "导出失败，请缩小范围重试。"); } }}><Download size={16} />导出问题清单</button></header>
    <div className="quality-audit-stats">{(["missing", "invalid", "duplicate"] as const).map(key => <button key={key} aria-pressed={kind === key} onClick={() => { setKind(kind === key ? "" : key); if (key === "duplicate") setField(""); reset(); }}><span>{issueLabels[key]}</span><strong>{audit.counts[key].toLocaleString()}</strong><small>{key === "duplicate" ? "条多余记录" : "个单元格"}</small></button>)}</div>
    <div className="quality-audit-toolbar"><label>问题类型<select value={kind} onChange={e => { setKind(e.target.value as IssueKind | ""); if (e.target.value === "duplicate") setField(""); reset(); }}><option value="">全部类型</option>{Object.entries(issueLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>检查字段<select value={field} disabled={kind === "duplicate"} onChange={e => { setField(e.target.value); reset(); }}><option value="">全部字段（含整行重复）</option>{profile.fields.map(f => <option key={f.name}>{f.name}</option>)}</select></label><span>{audit.total.toLocaleString()} 项问题 · 涉及 {audit.affectedRows.toLocaleString()} 条记录</span></div>
    {audit.total > 0 ? <><div className="table-overflow" role="region" aria-label="质量问题列表，可横向滚动" tabIndex={0}><table className="data-table"><thead><tr><th>记录</th><th>类型 / 字段</th><th>原始值</th><th>核对建议</th><th>操作</th></tr></thead><tbody>{audit.samples.slice(current * 10, current * 10 + 10).map((issue, i) => <tr key={`${issue.row}-${issue.field}-${i}`}><td>#{issue.row}</td><td><span className={`quality-issue-tag ${issue.kind}`}>{issueLabels[issue.kind]}</span><strong>{issue.field || "整行"}</strong></td><td><span className="quality-issue-value" title={String(issue.value ?? "")}>{issue.kind === "duplicate" ? "整行相同" : issue.value === null || issue.value === "" ? "空值" : String(issue.value)}</span></td><td>{issue.detail}</td><td><button className="text-button" onClick={() => setSelected(issue.row)} aria-label={`查看第 ${issue.row} 条完整记录`}>查看记录</button></td></tr>)}</tbody></table></div>
      <div className="quality-audit-footer"><span>{audit.total > audit.samples.length ? `页面保留前 ${audit.samples.length} 项证据，计数覆盖全部记录。` : "点击查看记录，核对同一行的完整上下文。"}</span><nav aria-label="问题列表分页"><button className="icon-button" aria-label="问题上一页" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={18} /></button><span>{current + 1} / {pages}</span><button className="icon-button" aria-label="问题下一页" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={18} /></button></nav></div></> : <div className="quality-audit-empty"><CheckCircle2 size={26} /><strong>{kind || field ? "当前条件下没有问题记录" : "本次规则检查未发现问题"}</strong><p>类型检查依赖字段类型；通过检查不代表业务数据一定正确。</p></div>}
    {audit.total > QUALITY_EXPORT_LIMIT && <p className="quality-audit-notice">单次导出最多 50,000 项问题，请按字段或类型缩小范围后分批导出。</p>}
    {row && <div ref={recordPanel} tabIndex={-1} className="quality-record" role="region" aria-label={`第 ${selected} 条完整记录`}><header><strong>第 {selected} 条完整记录</strong><button className="icon-button" aria-label="关闭完整记录" onClick={() => setSelected(null)}><X size={18} /></button></header><dl>{dataset.columns.map(column => <div key={column}><dt>{column}</dt><dd>{row[column] === null || row[column] === "" ? "空值" : String(row[column])}</dd></div>)}</dl></div>}
    {status && <p className="quality-audit-notice" role="status">{status}</p>}
  </section>;
}
