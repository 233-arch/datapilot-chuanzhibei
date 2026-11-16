"use client";
import { useMemo } from "react";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { type Dataset } from "@/lib/data-engine";
import { describeRule, evaluateRule, ruleLabels, type BusinessRule } from "@/lib/business-rules";

export function ReportQuality({ dataset, rules, onReview }: { dataset: Dataset; rules: BusinessRule[]; onReview: () => void }) {
  const results = useMemo(() => rules.map(rule => evaluateRule(dataset, rule, 0)), [dataset, rules]);
  const failing = results.filter(result => result.failed > 0).length;
  const unchecked = results.filter(result => result.checked === 0).length;
  return <section className="report-quality" aria-labelledby="report-quality-title"><header><div><span className="report-quality-label"><ClipboardCheck size={18} />报告质量依据</span><h2 id="report-quality-title">{rules.length ? `${rules.length} 条业务规则${failing ? `，${failing} 条发现违规` : unchecked ? `，${unchecked} 条尚无可检查记录` : "，已检查记录均符合条件"}` : "给结论补上业务核验依据"}</h2><p>{rules.length ? "规则条件、检查数量与结果已纳入 HTML 和 Markdown 完整报告。" : "目前尚未配置业务规则。可先定义编号唯一、金额范围等条件，再回到此处检查结果。"}</p></div><button className="button subtle" onClick={onReview}>{rules.length ? "核对规则与来源" : "设置业务规则"}<ArrowRight size={16} /></button></header>
    {rules.length > 0 && <details><summary>查看本次规则核验摘要</summary><div className="report-rule-list">{results.map(result => <article key={result.rule.id}><div><strong>{result.rule.field} · {ruleLabels[result.rule.kind]}</strong><p>{describeRule(result.rule)}</p></div><span>{result.checked ? `通过率 ${result.passRate!.toFixed(1)}%` : "未检查"}<small>违规 {result.failed.toLocaleString()} · 跳过 {result.skipped.toLocaleString()}</small></span></article>)}</div></details>}
    <p className="report-quality-scope">业务规则检查完整数据集，图表仍按各自筛选条件计算；通过规则不代表业务正确，未检查不能当作通过。</p></section>;
}
