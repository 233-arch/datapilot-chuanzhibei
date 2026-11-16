import { executePlan, filtersForPlan, reportMarkdown, type Dataset, type Plan, type Profile } from "./data-engine";
import { ruleReport, type BusinessRule } from "./business-rules";
import type { Dictionary } from "./workspace-kit";

export const REPORT_ANALYSIS_LIMIT = 30;
export type ReportSource = "current" | "pin" | "history";
export type ReportAnalysis = { key: string; plan: Plan; note?: string; mode?: string; sources: ReportSource[] };
type Candidate = { plan: Plan; note?: string; mode?: string };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}

/** One catalogue for the page and both exports; merge metadata without retaining cached totals. */
export function collectReportAnalyses(current: Plan, pins: Candidate[], history: Candidate[]): ReportAnalysis[] {
  const collected = new Map<string, ReportAnalysis>();
  const add = (item: Candidate, source: ReportSource) => {
    const key = JSON.stringify(stable({ ...item.plan, filter: undefined, filters: filtersForPlan(item.plan) }));
    const existing = collected.get(key);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.note && item.note) existing.note = item.note;
      if (!existing.mode && item.mode) existing.mode = item.mode;
    } else collected.set(key, { ...item, key, sources: [source] });
  };
  add({ plan: current }, "current");
  pins.forEach(item => add(item, "pin"));
  [...history].reverse().forEach(item => add(item, "history"));
  return [...collected.values()];
}

export function selectReportAnalyses(items: ReportAnalysis[], omitted: string[]): ReportAnalysis[] {
  const excluded = new Set(omitted);
  return items.filter(item => !excluded.has(item.key)).slice(0, REPORT_ANALYSIS_LIMIT);
}

export function markdownReport(dataset: Dataset, profile: Profile, analyses: ReportAnalysis[], dictionary: Dictionary, rules: BusinessRule[], meta?: { title: string; version: string; review: string }): string {
  if (!analyses.length) throw new Error("请至少选择一项分析后再导出报告。");
  if (analyses.length > REPORT_ANALYSIS_LIMIT) throw new Error("一份报告最多包含 30 项分析。");
  const results = analyses.map(item => ({ ...item, result: executePlan(dataset, profile, item.plan) }));
  const safe = (value: string) => value.replace(/[&<>|`\\\[\]#*]/g, c => `&#${c.charCodeAt(0)};`).replace(/[\r\n]/g, " ");
  const definitions = Object.entries(dictionary);
  const fields = definitions.length ? `\n## 字段字典\n\n| 字段 | 含义 / 别名 | 单位 |\n| --- | --- | --- |\n${definitions.map(([name, value]) => `| ${safe(name)} | ${safe(value.description)} / ${safe(value.aliases.join("、"))} | ${safe(value.unit)} |`).join("\n")}\n` : "";
  const quality = rules.length ? ruleReport(dataset, rules).replace(/^# /, "## ") : "## 业务规则检查\n\n未配置业务规则，尚未进行业务条件检查。基础完整率不能替代业务规则核验。\n";
  const content = reportMarkdown(dataset, profile, results);
  return `${meta?.title ? content.replace(/^# [^\n]*/, "# " + safe(meta.title)) : content}\n${meta ? `数据标记：${safe(meta.version)} · ${safe(meta.review)}\n` : ""}${fields}\n${quality}`;
}
