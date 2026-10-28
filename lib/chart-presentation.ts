import { type AnalysisResult, type Plan, toCSV } from "./data-engine";

export type ChartPoint = AnalysisResult["points"][number];
export const CHART_COLORS = ["#13876f", "#4e86bd", "#c28c3e", "#8875b2", "#449da1", "#c57462", "#729451", "#637da0"];
export const aggregateLabel = (plan: Plan) => ({ sum: "合计", mean: "均值", count: "记录数", max: "最大值", min: "最小值" })[plan.aggregate];
export function chartColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return CHART_COLORS[hash % CHART_COLORS.length];
}
/** Resolve palette collisions in a stable name order, independent of table/chart sorting. */
export function chartColors(points: readonly ChartPoint[]): Map<string, string> {
  const result = new Map<string, string>(), used = new Set<string>();
  for (const name of [...new Set(points.map(p => p.name))].sort()) {
    let index = CHART_COLORS.indexOf(chartColor(name));
    for (let step = 0; step < CHART_COLORS.length && used.has(CHART_COLORS[index]); step++) index = (index + 1) % CHART_COLORS.length;
    result.set(name, CHART_COLORS[index]); used.add(CHART_COLORS[index]);
  }
  return result;
}
/** Shares refer only to the displayed groups. Averages and extrema are not additive. */
export function displayedShare(points: readonly ChartPoint[], point: ChartPoint, aggregate: Plan["aggregate"]): number | null {
  if (!["sum", "count"].includes(aggregate) || points.some(p => !Number.isFinite(p.value) || p.value < 0)) return null;
  const total = points.reduce((sum, p) => sum + p.value, 0);
  return total > 0 && Number.isFinite(total) ? point.value / total * 100 : null;
}
export function pieUnavailable(points: readonly ChartPoint[], aggregate: Plan["aggregate"]): string | null {
  if (!["sum", "count"].includes(aggregate)) return "均值与极值不适合用饼图表达占比，请使用柱状图或折线图比较";
  if (points.some(p => p.value < 0)) return "当前指标含负值，不适合用饼图表达占比";
  if (points.every(p => p.value === 0)) return "当前聚合值均为 0，暂无可显示的占比";
  return null;
}
export function orderChartPoints(points: readonly ChartPoint[], sort: "original" | "asc" | "desc"): ChartPoint[] {
  return sort === "original" ? [...points] : [...points].sort((a, b) => (sort === "asc" ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name));
}
export function chartRange(points: readonly ChartPoint[], start?: number, end?: number): [string, string] | null {
  if (!points.length || start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  const a = Math.max(0, Math.min(points.length - 1, Math.trunc(start)));
  const b = Math.max(0, Math.min(points.length - 1, Math.trunc(end)));
  return [points[Math.min(a, b)].name, points[Math.max(a, b)].name];
}
export function chartCSV(plan: Plan, result: AnalysisResult): string {
  // Fixed headers avoid collisions when a user names their dimension “有效记录数”.
  return toCSV({ id: "chart-export", name: plan.title, source: "upload", createdAt: "",
    columns: ["分组字段", "分组值", "指标", "统计方式", "计算结果", "单位", "有效记录数"],
    rows: result.points.map(p => ({ 分组字段: plan.groupBy, 分组值: p.name, 指标: plan.aggregate === "count" ? "记录数" : plan.metric,
      统计方式: aggregateLabel(plan), 计算结果: p.value, 单位: result.unit, 有效记录数: p.count })),
  });
}
