"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { type Dataset } from "@/lib/data-engine";
import { describeRule, evaluateRule, exportRuleIssues, MAX_RULES, ruleLabels, ruleReport, validateRule, type BusinessRule } from "@/lib/business-rules";

export function BusinessRules({ dataset, rules, onChange, onInspect, onExport, onReport }: { dataset: Dataset; rules: BusinessRule[]; onChange: (rules: BusinessRule[]) => void; onInspect: (row: number) => void; onExport: (data: Dataset) => void; onReport: (text: string) => void }) {
  const [field, setField] = useState(dataset.columns[0] || "");
  const [kind, setKind] = useState<BusinessRule["kind"]>("required");
  const [min, setMin] = useState(""); const [max, setMax] = useState(""); const [values, setValues] = useState("");
  const [selected, setSelected] = useState(""); const [page, setPage] = useState(1);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [removed, setRemoved] = useState<BusinessRule | null>(null);
  const results = useMemo(() => rules.map(rule => evaluateRule(dataset, rule)), [dataset, rules]);
  const active = results.find(result => result.rule.id === selected) || results[0];
  const pages = Math.max(1, Math.ceil((active?.issues.length || 0) / 8));
  const currentPage = Math.min(page, pages);
  const affected = results.reduce((sum, result) => sum + result.failed, 0);
  function addRule(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      if (rules.length >= MAX_RULES) throw new Error("最多保存 12 条规则，请先移除不再使用的规则");
      const rule = validateRule({ id: crypto.randomUUID(), field, kind, min: min.trim() ? Number(min) : undefined, max: max.trim() ? Number(max) : undefined, values: values.split(/\r?\n/).filter(value => value.trim()) }, dataset.columns);
      if (rules.some(existing => existing.field === rule.field && existing.kind === rule.kind && describeRule(existing) === describeRule(rule))) throw new Error("已存在相同规则，请直接查看结果");
      onChange([...rules, rule]); setSelected(rule.id); setPage(1); setMessage("规则已添加，已检查完整数据集。");
    } catch (e) { setError((e as Error).message); }
  }
  function exportIssues(chosen: BusinessRule[]) {
    setError("");
    try { onExport(exportRuleIssues(dataset, chosen)); setMessage("违规清单已生成，请查看浏览器下载。"); } catch (e) { setError((e as Error).message); }
  }
  return <section className="business-rules" aria-labelledby="business-rules-title">
    <header className="rules-heading"><div className="rules-title"><span><ClipboardCheck size={25} /></span><div><h2 id="business-rules-title" tabIndex={-1}>业务规则检查</h2><p>把业务约定变成可验证的规则，每一项结果都能回到原始记录。</p></div></div><span className="rules-local">本机计算 · 无需 API</span></header>
    <div className="rules-explainer">检查完整数据集。空值只由“必填”规则检查，其他规则跳过空值；建议组合使用。规则不会自动修改数据。</div>
    <form className="rule-builder" onSubmit={addRule}>
      <label>检查字段<select value={field} onChange={e => setField(e.target.value)}>{dataset.columns.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>业务规则<select value={kind} onChange={e => { setKind(e.target.value as BusinessRule["kind"]); setError(""); }}>{Object.entries(ruleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {kind === "range" && <><label>最小值（含）<input inputMode="decimal" value={min} onChange={e => setMin(e.target.value)} placeholder="留空表示不限" /></label><label>最大值（含）<input inputMode="decimal" value={max} onChange={e => setMax(e.target.value)} placeholder="留空表示不限" /></label></>}
      {kind === "allowed" && <label className="rule-values">允许的值<textarea value={values} onChange={e => setValues(e.target.value)} placeholder={"每行一个，例如：\n线上商城\n线下门店"} maxLength={20100} /><small>去除首尾空格，区分大小写；最多 100 项。</small></label>}
      <button className="button primary" type="submit" disabled={!dataset.columns.length || rules.length >= MAX_RULES}><Plus size={16} />添加并检查</button>
    </form>
    {error && <p className="rule-error" role="alert">{error}</p>}
    {message && <p className="rule-status" role="status">{message}</p>}
    {!rules.length ? <div className="rules-empty"><ClipboardCheck size={30} /><h3>从一条业务约定开始</h3><p>例如：订单编号应唯一，销售额不能小于 0，渠道只允许指定选项。</p><p>检查条件由你确定，不将统计异常直接判定为业务错误。</p></div> : <>
      <div className="rules-toolbar"><span><strong>{rules.length}</strong> / {MAX_RULES} 条规则 · <strong>{affected.toLocaleString()}</strong> 项违规 <small>同一记录可能命中多条规则</small></span><div><button className="button subtle" onClick={() => exportIssues(rules)} disabled={!affected}><Download size={16} />全部违规清单</button><button className="button subtle" onClick={() => { onReport(ruleReport(dataset, rules)); setMessage("检查报告已生成，请查看浏览器下载。"); }}><Download size={16} />规则检查报告</button></div></div>
      <div className="rules-grid">{results.map(result => <article key={result.rule.id} className={`rule-card ${active?.rule.id === result.rule.id ? "selected" : ""}`}><button className="rule-select" aria-pressed={active?.rule.id === result.rule.id} onClick={() => { setSelected(result.rule.id); setPage(1); }}><span className="rule-kind">{ruleLabels[result.rule.kind]}</span><h3>{result.rule.field}</h3><p>{describeRule(result.rule)}</p><div className="rule-score"><strong>{result.passRate === null ? "未检查" : `${result.passRate.toFixed(1)}%`}</strong><span>通过率</span></div><span className="rule-meter"><span style={{ width: `${result.passRate ?? 0}%` }} /></span><span className="rule-counts">通过 {result.passed.toLocaleString()} · 违规 {result.failed.toLocaleString()} · 跳过 {result.skipped.toLocaleString()}</span></button><button className="rule-remove" aria-label={`移除${result.rule.field}${ruleLabels[result.rule.kind]}规则`} onClick={() => { setRemoved(result.rule); onChange(rules.filter(rule => rule.id !== result.rule.id)); setMessage("规则已移除，可撤销；原始数据未改变。"); }}><Trash2 size={15} />移除规则</button></article>)}</div>
      {active && <div className="rule-evidence"><header><div><h3>{active.rule.field} · {ruleLabels[active.rule.kind]}核验</h3><p>已检查 {active.checked.toLocaleString()} 条，跳过 {active.skipped.toLocaleString()} 个空值。记录序号从 1 开始，不含表头。</p></div><button className="button subtle" disabled={!active.failed} onClick={() => exportIssues([active.rule])}><Download size={16} />此规则违规清单</button></header>
        {active.failed ? <><div className="rule-table-scroll" tabIndex={0} role="region" aria-label="业务规则违规记录"><table><thead><tr><th>记录</th><th>原始值</th><th>核对原因</th><th>操作</th></tr></thead><tbody>{active.issues.slice((currentPage - 1) * 8, currentPage * 8).map(issue => <tr key={issue.row}><td>#{issue.row}</td><td className="rule-cell">{issue.value === null || String(issue.value).trim() === "" ? "空值" : String(issue.value)}</td><td>{issue.reason}</td><td><button className="button subtle" onClick={() => onInspect(issue.row - 1)} aria-label={`核对第${issue.row}条规则来源`}>核对完整记录</button></td></tr>)}</tbody></table></div><div className="rule-pagination"><span>页面保留前 {active.issues.length} 项证据，共 {active.failed.toLocaleString()} 项违规；导出包含全部匹配项（上限 50,000 项）。</span><button className="button subtle" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>规则上一页</button><span>{currentPage} / {pages}</span><button className="button subtle" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>规则下一页</button></div></> : <div className="rules-pass"><CheckCircle2 size={22} />{active.checked ? "已检查记录均符合此规则。请同时核对跳过的空值。" : "没有可检查记录，不能判定为全部通过。"}</div>}
      </div>}
    </>}
    {removed && <button className="button subtle rule-undo" disabled={rules.length >= MAX_RULES} onClick={() => { onChange([...rules, removed]); setSelected(removed.id); setRemoved(null); setPage(1); setMessage("已恢复移除的规则。"); }}><RotateCcw size={16} />撤销移除规则</button>}
  </section>;
}
