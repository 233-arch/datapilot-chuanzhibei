import { collapseWaterfall, type PeriodComparison } from "./diagnostics";

export type DiagnosticGroup = PeriodComparison["groups"][number];
export type WaterfallStep = {
  id: string;
  name: string;
  from: number;
  to: number;
  value: number;
  kind: "previous" | "current" | "group" | "remainder";
  group?: DiagnosticGroup;
  combined?: number;
};

export function waterfallSteps(result: PeriodComparison): WaterfallStep[] {
  let cursor = result.previous;
  const steps: WaterfallStep[] = [{ id: "previous", name: "基期", from: 0, to: cursor, value: cursor, kind: "previous" }];
  collapseWaterfall(result.groups).forEach((group, index) => {
    const combined = result.groups.length > 8 && index === 7;
    const from = cursor;
    cursor += group.delta;
    steps.push({ id: combined ? "remainder" : `group:${group.name}`, name: group.name, from, to: cursor, value: group.delta,
      kind: combined ? "remainder" : "group", group: combined ? undefined : group,
      combined: combined ? result.groups.length - 7 : undefined });
  });
  steps.push({ id: "current", name: "本期", from: 0, to: result.current, value: result.current, kind: "current" });
  return steps;
}

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

export function diagnosticTicks([lo, hi]: [number, number]) {
  const step = niceStep((hi - lo) / 5), first = Math.ceil(lo / step) * step;
  const count = Math.floor((hi - first) / step + 1e-8) + 1;
  return Array.from({length:Math.max(0, Math.min(8, count))}, (_, i) => Number((first + i * step).toPrecision(12)));
}

export function orderedDiagnosticGroups(groups: DiagnosticGroup[], direction: "all" | "increase" | "decrease") {
  return groups.filter(g => direction === "all" || (direction === "increase" ? g.delta > 0 : g.delta < 0))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name, "zh-CN"));
}

export function contributionBalance(groups: DiagnosticGroup[]) {
  return groups.reduce((sum, g) => ({ increase: sum.increase + Math.max(0, g.delta), decrease: sum.decrease + Math.min(0, g.delta) }), { increase: 0, decrease: 0 });
}
