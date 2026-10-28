import type { PeriodComparison } from "./diagnostics";
import { formatNumber } from "./data-engine";
export type DiagnosticGroup = PeriodComparison["groups"][number];

/** Always include zero and give constant/negative-only data a finite plot domain. */
export function diagnosticDomain(values: number[]): [number, number] {
  const finite = values.filter(Number.isFinite);
  const lo = Math.min(0, ...finite), hi = Math.max(0, ...finite);
  if (hi === lo) return [0, 1];
  const span = hi - lo, step = niceStep(span / 4);
  return [lo < 0 ? Math.floor((lo - span * .05) / step) * step : 0, Math.ceil((hi + span * .1) / step) * step];
}

function niceStep(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return ([1, 2, 2.5, 5, 10].find(n => n >= normalized) || 10) * magnitude;
}

export function orderedDiagnosticGroups(groups: DiagnosticGroup[], direction: "all" | "increase" | "decrease") {
  return groups.filter(g => direction === "all" || (direction === "increase" ? g.delta > 0 : g.delta < 0))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name, "zh-CN"));
}

export function contributionBalance(groups: DiagnosticGroup[]) {
  return groups.reduce((sum, g) => ({ increase: sum.increase + Math.max(0, g.delta), decrease: sum.decrease + Math.min(0, g.delta) }), { increase: 0, decrease: 0 });
}

/** Both periods share a zero origin and scale, including signed values. */
export function barGeometry(value: number, [lo, hi]: [number, number]) {
  const span = hi - lo;
  const position = (v: number) => Math.max(0, Math.min(100, (v - lo) / span * 100));
  const zero = position(0), end = position(value);
  return { zero, left: Math.min(zero, end), width: Math.abs(end - zero) };
}

export function changeText(delta: number, unit = "") {
  if (!Number.isFinite(delta)) return "数值超出展示范围";
  return delta === 0 ? "没有变化" : `${delta > 0 ? "增加" : "减少"} ${formatNumber(Math.abs(delta))}${unit}`;
}
