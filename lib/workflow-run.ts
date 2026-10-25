import {
  type Dataset,
  type Profile,
  type FilterClause,
  filterDataset,
  dateBucket,
} from "./data-engine";
import { type PeriodComparison, type Fact } from "./diagnostics";
import {
  type WorkflowPlan,
  validateWorkflowPlan,
  type SavedMetric,
  metricValue,
} from "./workbench";
import { type Snippet } from "./knowledge";
import { type checkLabels } from "./explainer";
export type WorkflowComparison = {
  dimension: string;
  result: PeriodComparison;
};
export type WorkflowGuide = {
  focus: string[];
  checks: (keyof typeof checkLabels)[];
  latencyMs: number;
  usage: { input: number | null; output: number | null };
};
export function workflowFacts(comparisons: WorkflowComparison[]): Fact[] {
  if (!comparisons.length) return [];
  return [
    ...comparisons[0].result.facts.slice(0, 4),
    ...comparisons.flatMap((c, i) =>
      c.result.facts
        .slice(4, 7)
        .map((f) => ({
          ...f,
          id: `dimension-${i}-${f.id}`,
          title: c.dimension + " · " + f.title,
        })),
    ),
  ];
}
export function workflowSource(
  dataset: Dataset,
  profile: Profile,
  filters: FilterClause[],
  plan: WorkflowPlan,
  dimension: string,
  period: "current" | "previous" | "both",
  group?: string,
) {
  validateWorkflowPlan(plan, profile);
  if (!plan.dimensions.includes(dimension))
    throw new Error("来源维度不属于当前计划。");
  const scope = filterDataset(dataset, filters, profile);
  return {
    ...scope,
    rows: scope.rows.filter((row) => {
      const day = dateBucket(String(row[plan.date] ?? ""), "day");
      const inside = (range: { start: string; end: string }) =>
        day >= range.start && day <= range.end;
      return (
        (period === "both"
          ? inside(plan.current) || inside(plan.previous)
          : inside(plan[period])) &&
        (group === undefined || String(row[dimension] ?? "未填写") === group)
      );
    }),
  };
}
const plain = (v: string) => v.replace(/[\r\n|]/g, " ");
export function workflowMarkdown(
  plan: WorkflowPlan,
  filters: FilterClause[],
  quality: Pick<
    Profile,
    "rowCount" | "missing" | "duplicates" | "completeness"
  >,
  comparisons: WorkflowComparison[],
  guide: WorkflowGuide | null,
  snippets: Snippet[],
  metrics: SavedMetric[],
  scope: Dataset,
) {
  const facts = workflowFacts(comparisons);
  return (
    `# ${plain(plan.title)}\n\n指标：${plan.metric}合计；日期：${plan.date}\n本期：${plan.current.start} 至 ${plan.current.end}\n基期：${plan.previous.start} 至 ${plan.previous.end}\n全局筛选：${JSON.stringify(filters)}\n\n## 数据范围核对\n记录 ${quality.rowCount} 条；缺失单元格 ${quality.missing}；完全重复记录 ${quality.duplicates}；完整率 ${quality.completeness}% 。原始数据未被自动清洗。\n\n` +
    comparisons
      .map(
        (c) =>
          `## ${plain(c.dimension)}分解\n本期 ${c.result.current}；基期 ${c.result.previous}；差额 ${c.result.delta}；增长率 ${c.result.growth === null ? "不适用" : c.result.growth * 100 + "%"}\n\n|分组|基期|本期|差额|\n|---|---:|---:|---:|\n` +
          c.result.groups
            .map(
              (g) => `|${plain(g.name)}|${g.previous}|${g.current}|${g.delta}|`,
            )
            .join("\n") +
          "\n\n核查事项：\n" +
          c.result.warnings.map((w) => "- " + w).join("\n"),
      )
      .join("\n\n") +
    "\n\n## AI选择的计算证据\n" +
    (guide
      ? guide.focus
          .map((id) => {
            const f = facts.find((f) => f.id === id);
            return f
              ? `- [${id}] ${f.title}：${f.value ?? "不适用"}${f.unit}；${f.detail}`
              : "";
          })
          .join("\n")
      : "尚未完成AI证据导读；以上数字来自本机计算。") +
    "\n\n## 参考的业务定义（用户提供，需核对适用性）\n" +
    snippets
      .filter((s) => plan.knowledgeIds.includes(s.id))
      .map(
        (s) =>
          `- [${s.id}] ${s.title}；版本 ${s.version}；来源 ${s.source}\n  ${s.text}`,
      )
      .join("\n") +
    "\n\n## 保存指标（当前完整筛选范围，非上述两个周期）\n" +
    metrics
      .map((m) => {
        const r = metricValue(scope, m);
        return `- ${m.name}：${r.value === null ? "不适用" : r.value * (m.percent ? 100 : 1) + (m.percent ? "%" : m.unit)}；${m.numerator}合计 / ${m.denominator}${m.kind === "distinct" ? "去重数" : "合计"}；参与 ${r.valid} 条、排除 ${r.excluded} 条。${m.description}`;
      })
      .join("\n") +
    "\n\n分组贡献描述统计变化，不能证明业务因果。没有记录不等于业务为零；相同变化在不同维度的分解不能相加。模型仅规划并选择证据，数字由本机计算；业务定义来源未经外部认证。\n"
  );
}
