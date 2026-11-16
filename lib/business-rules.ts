import { numeric, type Cell, type Dataset } from "./data-engine";

export type BusinessRule = { id: string; field: string; kind: "required" | "unique" | "range" | "allowed"; min?: number; max?: number; values?: string[] };
export const ruleLabels = { required: "必填", unique: "字段唯一", range: "数值范围", allowed: "允许值列表" } as const;
export const MAX_RULES = 12;
export const RULE_EXPORT_LIMIT = 50000;
export function validateRule(value: unknown, columns: string[]): BusinessRule {
  if (!value || typeof value !== "object") throw new Error("规则格式无效");
  const r = value as BusinessRule;
  if (typeof r.id !== "string" || !r.id || r.id.length > 80 || !columns.includes(r.field) || !Object.hasOwn(ruleLabels, r.kind)) throw new Error("请选择有效的字段和规则类型");
  const base: BusinessRule = { id: r.id, field: r.field, kind: r.kind };
  if (r.kind === "range") {
    if ((r.min === undefined && r.max === undefined) || (r.min !== undefined && (typeof r.min !== "number" || !Number.isFinite(r.min))) || (r.max !== undefined && (typeof r.max !== "number" || !Number.isFinite(r.max))) || (r.min !== undefined && r.max !== undefined && r.min > r.max)) throw new Error("请填写有效上下限，最小值不能大于最大值");
    base.min = r.min; base.max = r.max;
  }
  if (r.kind === "allowed") {
    if (!Array.isArray(r.values) || !r.values.length || r.values.length > 100 || r.values.some(v => typeof v !== "string" || !v.trim() || v.length > 200)) throw new Error("允许值需为 1–100 项非空文本，每项最多 200 字");
    base.values = [...new Set(r.values.map(v => v.trim()))];
  }
  return base;
}
export function restoreRules(value: unknown, columns: string[]): BusinessRule[] {
  if (!Array.isArray(value) || value.length > MAX_RULES) return [];
  const rules: BusinessRule[] = [];
  for (const candidate of value) {
    try { const rule = validateRule(candidate, columns); if (!rules.some(r => r.id === rule.id)) rules.push(rule); } catch { /* A stale field must not invalidate unrelated rules. */ }
  }
  return rules;
}
export function describeRule(rule: BusinessRule): string {
  return rule.kind === "range" ? `${rule.min ?? "不限"} ≤ 数值 ≤ ${rule.max ?? "不限"}` : rule.kind === "allowed" ? `允许：${rule.values!.join("、")}` : rule.kind === "unique" ? "非空值须唯一（按去除首尾空格后的文本比较）" : "不得为空或仅包含空格";
}
const missing = (value: Cell | undefined) => value == null || (typeof value === "string" && !value.trim());
export type RuleIssue = { row: number; value: Cell; reason: string };
export type RuleResult = { rule: BusinessRule; total: number; checked: number; passed: number; failed: number; skipped: number; passRate: number | null; issues: RuleIssue[] };
/** Counts all records; retained evidence is bounded independently of counts. */
export function evaluateRule(dataset: Dataset, candidate: BusinessRule, sampleLimit = 200): RuleResult {
  const rule = validateRule(candidate, dataset.columns);
  const limit = Math.min(RULE_EXPORT_LIMIT, Math.max(0, Math.floor(sampleLimit) || 0));
  const counts = new Map<string, number>();
  if (rule.kind === "unique") for (const row of dataset.rows) {
    const value = row[rule.field]; if (!missing(value)) { const key = String(value).trim(); counts.set(key, (counts.get(key) || 0) + 1); }
  }
  const allowed = new Set(rule.values);
  const issues: RuleIssue[] = [];
  let skipped = 0, failed = 0;
  dataset.rows.forEach((row, index) => {
    const value = row[rule.field] ?? null;
    if (rule.kind !== "required" && missing(value)) { skipped++; return; }
    let reason = "";
    if (rule.kind === "required" && missing(value)) reason = "字段为空";
    if (rule.kind === "unique" && (counts.get(String(value).trim()) || 0) > 1) reason = `该值共出现 ${counts.get(String(value).trim())} 次；所有重复组成员均需核对`;
    if (rule.kind === "allowed" && !allowed.has(String(value).trim())) reason = "不在允许值列表内（区分大小写）";
    if (rule.kind === "range") {
      const n = numeric(value);
      if (n === null) reason = "无法解析为有限数值";
      else if ((rule.min !== undefined && n < rule.min) || (rule.max !== undefined && n > rule.max)) reason = "超出含边界的数值范围";
    }
    if (reason) { failed++; if (issues.length < limit) issues.push({ row: index + 1, value, reason }); }
  });
  const checked = dataset.rows.length - skipped;
  return { rule, total: dataset.rows.length, checked, passed: checked - failed, failed, skipped, passRate: checked ? 100 * (checked - failed) / checked : null, issues };
}
export function exportRuleIssues(dataset: Dataset, rules: BusinessRule[]): Dataset {
  if (rules.length > MAX_RULES) throw new Error("规则数量超限");
  const results = rules.map(rule => evaluateRule(dataset, rule, RULE_EXPORT_LIMIT));
  if (results.reduce((sum, result) => sum + result.failed, 0) > RULE_EXPORT_LIMIT) throw new Error("违规项超过 50,000 条，请选择单条规则分批导出");
  return { ...dataset, id: `${dataset.id}-rules`, name: `${dataset.name.replace(/\.[^.]+$/, "")}_业务规则违规清单.csv`, types: undefined,
    columns: ["规则", "字段", "条件", "记录序号", "原始值", "违规原因"],
    rows: results.flatMap(result => result.issues.map(issue => ({ 规则: ruleLabels[result.rule.kind], 字段: result.rule.field, 条件: describeRule(result.rule), 记录序号: issue.row, 原始值: issue.value, 违规原因: issue.reason }))) };
}
export function ruleReport(dataset: Dataset, rules: BusinessRule[]): string {
  const safe = (s: string) => s.replace(/\\/g, "\\\\").replace(/[|`<>]/g, c => `&#${c.charCodeAt(0)};`).replace(/[\r\n]/g, " ");
  const results = rules.map(rule => evaluateRule(dataset, rule, 0));
  return [`# 业务规则检查报告`, "", `数据集：${safe(dataset.name)}`, `记录数：${dataset.rows.length}`, `生成时间：${new Date().toISOString()}`, "", "检查完整当前数据集，不受分析筛选影响。通过率为通过记录 / 实际检查记录。空值只由必填规则检查，其他规则跳过空值；未检查不等于通过。唯一规则标记重复组中的全部记录。", "", "| 字段 | 规则 | 条件 | 已检查 | 通过 | 违规 | 跳过空值 | 通过率 |", "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |", ...results.map(r => `| ${safe(r.rule.field)} | ${ruleLabels[r.rule.kind]} | ${safe(describeRule(r.rule))} | ${r.checked} | ${r.passed} | ${r.failed} | ${r.skipped} | ${r.passRate === null ? "未检查" : `${r.passRate.toFixed(1)}%`} |`), "", "规则由使用者定义，结果仅说明是否符合所选条件，不代表数据业务正确。不自动修改原始数据。同一记录可能触发多条规则，不可将违规项合计直接当作记录数。", ""].join("\n");
}

/** Script-free report section; conditions and field names are escaped as text. */
export function ruleReportHTML(dataset: Dataset, rules: BusinessRule[]): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  if (!rules.length) return `<section aria-label="业务规则检查"><h2>业务规则检查</h2><p>未配置业务规则，尚未进行业务条件检查。基础完整率不能替代业务规则核验。</p></section>`;
  if (rules.length > MAX_RULES) throw new Error("规则数量超限");
  const results = rules.map(rule => evaluateRule(dataset, rule, 0));
  return `<section aria-label="业务规则检查"><h2>业务规则检查</h2><p>检查完整当前数据集（${dataset.rows.length.toLocaleString()} 条），不受图表分析筛选影响。各项为独立规则，同一记录可命中多条规则。</p><table><thead><tr><th>字段与规则</th><th>条件</th><th>已检查</th><th>通过</th><th>违规</th><th>跳过空值</th><th>通过率</th></tr></thead><tbody>${results.map(r => `<tr><td>${escape(r.rule.field)}<br>${ruleLabels[r.rule.kind]}</td><td>${escape(describeRule(r.rule))}</td><td>${r.checked}</td><td>${r.passed}</td><td>${r.failed}</td><td>${r.skipped}</td><td>${r.passRate === null ? "未检查" : `${r.passRate.toFixed(1)}%`}</td></tr>`).join("")}</tbody></table><p>通过率 = 通过 / 已检查。空值由必填规则检查，其余规则跳过空值；无可检查记录显示“未检查”。字段唯一规则标记重复组全部成员。规则由使用者定义，通过不代表业务正确，不自动修改数据。</p><p>该报告保留条件和统计，不包含逐行原始值。完整违规明细可在质量检查页单独导出。</p></section>`;
}
