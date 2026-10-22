import {
  type Dataset, type Profile, type Plan, type AnalysisResult,
  defaultPlan, executePlan, filterDataset, profileDataset,
  filtersForPlan, mergeFilters, validatePlan, validateFilters,
} from "./data-engine";

export const aggregateLabels = { sum: "合计", mean: "均值", count: "记录数", max: "最大值", min: "最小值" };
export type ExplorationTask = { id: string; title: string; reason: string; question: string; plan: Plan; kind: "trend" | "compare" | "quality" };
export function proposeAnalysis(dataset: Dataset, profile: Profile, current: Plan, proposal: Plan): { plan: Plan; result: AnalysisResult } {
  validatePlan(current, profile);
  validatePlan(proposal, profile);
  const filters = mergeFilters(filtersForPlan(current), filtersForPlan(proposal));
  validateFilters(filters, profile.fields);
  const plan = { ...proposal, filter: undefined, filters };
  return { plan, result: executePlan(dataset, profile, plan) };
}

/** Suggestions describe actual scoped data; they are not generated model claims. */
export function explorationTasks(dataset: Dataset, profile: Profile, current: Plan): ExplorationTask[] {
  const scoped = filterDataset(dataset, filtersForPlan(current));
  if (!scoped.rows.length) return [];
  const local = profileDataset(scoped);
  const metric = profile.fields.find(f => f.name === current.metric && f.type === "number") || profile.fields.find(f => f.type === "number");
  const date = profile.fields.find(f => f.type === "date");
  const dims = profile.fields.filter(f => f.type === "text" && f.unique > 1 && f.unique <= 30);
  const base = { ...defaultPlan(profile), metric: metric?.name || "", aggregate: metric ? (current.aggregate === "count" ? "sum" : current.aggregate) : "count", filters: filtersForPlan(current), filter: undefined } as Plan;
  const tasks: ExplorationTask[] = [];
  if (date) tasks.push({
    id: "trend", kind: "trend", title: "沿时间找变化",
    reason: `发现日期字段「${date.name}」，可在当前 ${scoped.rows.length.toLocaleString()} 条记录中按月观察。`,
    question: `按月查看${metric?.name || "记录数"}${metric ? aggregateLabels[base.aggregate] : ""}趋势`,
    plan: { ...base, title: `${metric?.name || "记录数"}月度趋势`, groupBy: date.name, chart: "line", timeGrain: "month", sort: "natural", limit: 12 },
  });
  const dimension = dims.find(f => f.name !== current.groupBy) || dims[0];
  if (dimension) tasks.push({
    id: "compare", kind: "compare", title: `换个角度：${dimension.name}`,
    reason: `按「${dimension.name}」对比${metric?.name || "记录数"}，保持当前筛选和计算口径。`,
    question: `按${dimension.name}统计${metric?.name || "记录数"}${metric ? aggregateLabels[base.aggregate] : ""}`,
    plan: { ...base, title: `${dimension.name}对比`, groupBy: dimension.name, chart: "bar", sort: "desc", limit: 10 },
  });
  const missing = [...local.fields].sort((a,b) => b.missing - a.missing).find(f => f.missing > 0);
  if (missing) {
    try {
      const filters = mergeFilters(filtersForPlan(current), [{ field: missing.name, operator: "missing", value: "" }]);
      validateFilters(filters, profile.fields);
      tasks.push({ id: "quality", kind: "quality", title: `核对${missing.name}缺失`,
        reason: `当前范围有 ${missing.missing.toLocaleString()} 条「${missing.name}」为空；先看分布，再决定是否清洗。`,
        question: `检查${missing.name}为空的记录分布`,
        plan: { ...base, title: `${missing.name}缺失记录分布`, metric: "", aggregate: "count", groupBy: dimension?.name || profile.fields[0].name, chart: "bar", sort: "desc", filters },
      });
    } catch { /* No additional task when the current scope already uses all filter slots. */ }
  }
  return tasks.filter(task => { try { validatePlan(task.plan, profile); return true; } catch { return false; } });
}

export type JourneyStep = { id: string; plan: Plan; createdAt: string; label: string };
export type JourneyState = { datasetId: string; steps: JourneyStep[]; cursor: number };
export function planKey(plan: Plan): string {
  return JSON.stringify({ ...plan, filter: undefined, filters: [...filtersForPlan(plan)].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
}
export function recordJourney(state: JourneyState, datasetId: string, plan: Plan, profile: Profile, id: string, now: string): JourneyState {
  validatePlan(plan, profile);
  const steps = state.datasetId === datasetId ? state.steps : [];
  const cursor = state.datasetId === datasetId ? state.cursor : -1;
  if (steps[cursor] && planKey(steps[cursor].plan) === planKey(plan)) return state;
  const next = [...steps.slice(0, cursor + 1), { id, plan: structuredClone(plan), createdAt: now, label: `${plan.groupBy} · ${plan.aggregate === "count" ? "记录数" : plan.metric + aggregateLabels[plan.aggregate]}` }].slice(-20);
  return { datasetId, steps: next, cursor: next.length - 1 };
}
export function restoreJourney(value: unknown, datasetId: string, profile: Profile): JourneyState {
  const empty = { datasetId, steps: [], cursor: -1 };
  if (!value || typeof value !== "object") return empty;
  const input = value as JourneyState;
  if (input.datasetId !== datasetId || !Array.isArray(input.steps)) return empty;
  const steps = input.steps.slice(-20).filter(step => {
    try {
      if (!step || typeof step.id !== "string" || step.id.length > 100 || typeof step.label !== "string" || step.label.length > 250 || typeof step.createdAt !== "string") return false;
      validatePlan(step.plan, profile);
      return true;
    } catch { return false; }
  });
  // Any discarded snapshot changes the indexes; resume at the last valid snapshot.
  const cursor = steps.length === input.steps.length && Number.isInteger(input.cursor) && input.cursor >= 0 && input.cursor < steps.length ? input.cursor : steps.length - 1;
  return { datasetId, steps, cursor };
}
