import {
  type Dataset,
  type Plan,
  type Profile,
  type FilterClause,
  type AnalysisResult,
  numeric,
  profileDataset,
  executePlan,
  matchesFilters,
  filtersForPlan,
  validateFilters,
  validatePlan,
  groupFilter,
} from "./data-engine";

export type PinnedInsight = {
  id: string;
  name: string;
  plan: Plan;
  createdAt: string;
  note: string;
};
export function scopedProfile(dataset: Dataset, original: Profile): Profile {
  const scoped = profileDataset(dataset);
  return {
    ...scoped,
    fields: scoped.fields.map((field) => ({
      ...field,
      type:
        original.fields.find((f) => f.name === field.name)?.type || field.type,
    })),
  };
}
export function evidenceRows(
  dataset: Dataset,
  profile: Profile,
  plan: Plan,
  name: string,
): Dataset {
  const filters = [...filtersForPlan(plan), groupFilter(plan, name, profile)];
  validatePlan(plan, profile);
  return {
    ...dataset,
    rows: dataset.rows.filter((row) => matchesFilters(row, filters)),
  };
}
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q,
    index = Math.floor(pos),
    fraction = pos - index;
  return (
    sorted[index] +
    (sorted[Math.min(index + 1, sorted.length - 1)] - sorted[index]) * fraction
  );
}
export function detectAnomalies(
  dataset: Dataset,
  metric: string,
  factor = 1.5,
) {
  if (
    !dataset.columns.includes(metric) ||
    !Number.isFinite(factor) ||
    factor < 0.5 ||
    factor > 3
  )
    throw new Error("异常检测参数不合法。");
  const valid = dataset.rows
    .map((row, index) => ({ row, index, value: numeric(row[metric]) }))
    .filter(
      (
        x,
      ): x is { row: Dataset["rows"][number]; index: number; value: number } =>
        x.value !== null,
    );
  const sorted = valid.map((x) => x.value).sort((a, b) => a - b),
    q1 = quantile(sorted, 0.25),
    median = quantile(sorted, 0.5),
    q3 = quantile(sorted, 0.75),
    iqr = q3 - q1,
    lower = q1 - factor * iqr,
    upper = q3 + factor * iqr;
  const insufficient = valid.length < 4;
  const anomalies = insufficient
    ? []
    : valid
        .filter((x) => x.value < lower || x.value > upper)
        .map((x) => ({
          ...x,
          direction: x.value < lower ? ("偏低" as const) : ("偏高" as const),
        }))
        .sort(
          (a, b) => Math.abs(b.value - median) - Math.abs(a.value - median),
        );
  return {
    q1,
    median,
    q3,
    iqr,
    lower,
    upper,
    valid: valid.length,
    excluded: dataset.rows.length - valid.length,
    insufficient,
    anomalies,
  };
}
export function simulateScenario(
  dataset: Dataset,
  metric: string,
  percent: number,
  target?: FilterClause,
) {
  if (
    !dataset.columns.includes(metric) ||
    !Number.isFinite(percent) ||
    percent < -90 ||
    percent > 100
  )
    throw new Error("模拟参数超出范围。");
  let baseline = 0,
    affectedBaseline = 0,
    affected = 0,
    valid = 0;
  const rows = dataset.rows.map((original) => {
    const n = numeric(original[metric]);
    if (n === null) return { ...original };
    valid++;
    baseline += n;
    if (target && !matchesFilters(original, [target])) return { ...original };
    affected++;
    affectedBaseline += n;
    return { ...original, [metric]: n * (1 + percent / 100) };
  });
  const delta = (affectedBaseline * percent) / 100;
  return {
    baseline,
    simulated: baseline + delta,
    delta,
    affected,
    valid,
    dataset: { ...dataset, rows, name: `情景模拟_${dataset.name}` },
  };
}
export function compareInsights(
  dataset: Dataset,
  profile: Profile,
  left: PinnedInsight,
  right: PinnedInsight,
) {
  for (const key of ["groupBy", "metric", "aggregate", "timeGrain"] as const)
    if (left.plan[key] !== right.plan[key])
      return {
        compatible: false as const,
        reason: "请选择维度、指标、聚合方式和时间粒度一致的两项洞察。",
      };
  const a = executePlan(dataset, profile, left.plan),
    b = executePlan(dataset, profile, right.plan);
  const names = [
    ...new Set([
      ...a.points.map((p) => p.name),
      ...b.points.map((p) => p.name),
    ]),
  ];
  return {
    compatible: true as const,
    left: a,
    right: b,
    points: names.map((name) => {
      const before = a.points.find((p) => p.name === name)?.value,
        after = b.points.find((p) => p.name === name)?.value;
      return {
        name,
        before: before ?? null,
        after: after ?? null,
        delta:
          before === undefined || after === undefined ? null : after - before,
      };
    }),
  };
}
export function insightSummary(plan: Plan, result: AnalysisResult): string {
  return `${plan.groupBy} / ${plan.aggregate === "count" ? "记录数" : plan.metric} · ${result.validRows.toLocaleString("zh-CN")} 条有效记录 · ${filtersForPlan(plan).length} 个筛选`;
}
