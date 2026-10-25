import { z } from "zod";
import {
  type Dataset,
  type Profile,
  type FilterClause,
  validateFilters,
} from "./data-engine";
import { periodDefaults, validDay, ratioMetric } from "./diagnostics";

const day = z.string().refine(validDay, "日期无效");
export const periodSchema = z.object({ start: day, end: day }).strict();
export const diagnosticSchema = z
  .object({
    date: z.string().max(100),
    metric: z.string().max(100),
    dimension: z.string().max(100),
    current: periodSchema,
    previous: periodSchema,
    numerator: z.string().max(100),
    denominator: z.string().max(100),
    kind: z.enum(["ratio", "distinct"]),
    percent: z.boolean(),
  })
  .strict();
export type DiagnosticState = z.infer<typeof diagnosticSchema>;
export const metricSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(40),
    numerator: z.string().min(1).max(100),
    denominator: z.string().min(1).max(100),
    kind: z.enum(["ratio", "distinct"]),
    percent: z.boolean(),
    unit: z.string().trim().max(20),
    description: z.string().trim().max(300),
  })
  .strict();
export type SavedMetric = z.infer<typeof metricSchema>;
export function defaultDiagnostic(
  dataset: Dataset,
  profile: Profile,
): DiagnosticState {
  const date = profile.fields.find((f) => f.type === "date")?.name || "";
  const nums = profile.fields.filter((f) => f.type === "number");
  const metric =
    nums.find((f) => /销售额|收入|消费金额|sales/i.test(f.name))?.name ||
    nums[0]?.name ||
    "";
  return {
    date,
    metric,
    dimension:
      profile.fields.find((f) => f.type === "text" && f.unique < 100)?.name ||
      "",
    ...periodDefaults(dataset, date),
    numerator: nums.find((f) => /利润/.test(f.name))?.name || metric,
    denominator: metric,
    kind: "ratio",
    percent: true,
  };
}
export function validateMetric(value: unknown, profile: Profile): SavedMetric {
  const m = metricSchema.parse(value);
  if (
    profile.fields.find((f) => f.name === m.numerator)?.type !== "number" ||
    !profile.fields.some(
      (f) =>
        f.name === m.denominator &&
        (m.kind === "distinct" || f.type === "number"),
    )
  )
    throw new Error("指标公式必须使用当前数据的数值字段和有效分母。");
  return m;
}
export function saveMetric(
  items: SavedMetric[],
  value: unknown,
  profile: Profile,
) {
  const metric = validateMetric(value, profile);
  if (items.some((m) => m.id !== metric.id && m.name === metric.name))
    throw new Error("指标名称已存在，请使用不同名称。");
  const next = [...items.filter((m) => m.id !== metric.id), metric];
  if (next.length > 12)
    throw new Error("最多保存12个指标，请先删除不需要的指标。");
  return next;
}
export function metricValue(dataset: Dataset, m: SavedMetric) {
  return ratioMetric(dataset, m.numerator, m.denominator, m.kind);
}
export function restoreDiagnostic(
  value: unknown,
  dataset: Dataset,
  profile: Profile,
): DiagnosticState {
  const fallback = defaultDiagnostic(dataset, profile);
  const parsed = diagnosticSchema.safeParse(value);
  if (!parsed.success) return fallback;
  const s = parsed.data;
  if (
    profile.fields.find((f) => f.name === s.date)?.type !== "date" ||
    profile.fields.find((f) => f.name === s.metric)?.type !== "number" ||
    profile.fields.find((f) => f.name === s.dimension)?.type !== "text" ||
    profile.fields.find((f) => f.name === s.numerator)?.type !== "number" ||
    (s.denominator !== "" &&
      !profile.fields.some(
        (f) =>
          f.name === s.denominator &&
          (s.kind === "distinct" || f.type === "number"),
      ))
  )
    return fallback;
  return s;
}
export const workflowPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    date: z.string().min(1).max(100),
    metric: z.string().min(1).max(100),
    dimensions: z.array(z.string().min(1).max(100)).min(1).max(3),
    current: periodSchema,
    previous: periodSchema,
    knowledgeIds: z.array(z.string().min(1).max(80)).max(4),
  })
  .strict();
export type WorkflowPlan = z.infer<typeof workflowPlanSchema>;
export function validateWorkflowPlan(
  value: unknown,
  profile: Profile,
  allowedKnowledge?: string[],
) {
  const p = workflowPlanSchema.parse(value);
  if (
    profile.fields.find((f) => f.name === p.date)?.type !== "date" ||
    profile.fields.find((f) => f.name === p.metric)?.type !== "number" ||
    p.dimensions.some(
      (d) => profile.fields.find((f) => f.name === d)?.type !== "text",
    ) ||
    new Set(p.dimensions).size !== p.dimensions.length
  )
    throw new Error("计划使用了不存在、重复或类型不符的字段。");
  if (
    p.current.start > p.current.end ||
    p.previous.start > p.previous.end ||
    (p.current.start <= p.previous.end && p.previous.start <= p.current.end)
  )
    throw new Error("计划的比较周期无效或重叠。");
  if (
    new Set(p.knowledgeIds).size !== p.knowledgeIds.length ||
    (allowedKnowledge &&
      p.knowledgeIds.some((id) => !allowedKnowledge.includes(id)))
  )
    throw new Error("计划引用了无效的知识片段。");
  return p;
}
export type WorkflowState = { question: string; plan: WorkflowPlan | null };
export function restoreWorkflow(
  value: unknown,
  profile: Profile,
): WorkflowState {
  try {
    const v = z
      .object({
        question: z.string().max(2000),
        plan: workflowPlanSchema.nullable(),
      })
      .strict()
      .parse(value);
    return {
      question: v.question,
      plan: v.plan ? validateWorkflowPlan(v.plan, profile) : null,
    };
  } catch {
    return { question: "", plan: null };
  }
}
export function workflowScopeKey(
  datasetId: string,
  profile: Profile,
  filters: FilterClause[],
  plan: WorkflowPlan,
) {
  validateWorkflowPlan(plan, profile);
  validateFilters(filters, profile.fields);
  return JSON.stringify({
    datasetId,
    fields: profile.fields.map((f) => [
      f.name,
      f.type,
      f.description,
      f.unit,
      f.aliases,
    ]),
    filters,
    plan,
  });
}
