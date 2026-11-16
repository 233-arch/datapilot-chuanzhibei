import { type Dataset, type Plan, type Profile, validatePlan, executePlan } from "./data-engine";
import type { BusinessRule } from "./business-rules";
import type { PinnedInsight } from "./exploration";
export type TemplateId = "campus" | "retail";
export type TemplateMapping = { date: string; amount: string; category: string };
export const analysisTemplates = [
  { id: "campus" as const, title: "校园消费分析", description: "观察消费趋势、消费场所分布与构成。", category: "消费场所", amount: "消费金额", pattern: /场所|商户|消费类型|类型/ },
  { id: "retail" as const, title: "零售经营分析", description: "观察销售趋势、地区表现与销售构成。", category: "地区或品类", amount: "销售金额", pattern: /地区|区域|品类|类别|region|category/i },
];
export function suggestMapping(id: TemplateId, profile: Profile): TemplateMapping {
  const template = analysisTemplates.find(t => t.id === id)!;
  return { date: profile.fields.find(f => f.type === "date")?.name || "", amount: profile.fields.find(f => f.type === "number" && /金额|销售额|revenue|sales/i.test(f.name))?.name || profile.fields.find(f => f.type === "number")?.name || "",
    category: profile.fields.find(f => f.type === "text" && template.pattern.test(f.name))?.name || profile.fields.find(f => f.type === "text")?.name || "" };
}
export function buildTemplate(id: TemplateId, map: TemplateMapping, dataset: Dataset, profile: Profile) {
  const template = analysisTemplates.find(t => t.id === id);
  if (!template) throw new Error("未知场景模板。");
  for (const [key, type, label] of [["date", "date", "日期"], ["amount", "number", "金额"], ["category", "text", "分类"]] as const)
    if (!profile.fields.some(f => f.name === map[key] && f.type === type)) throw new Error(`请为${label}选择有效的${{ date: "日期", number: "数值", text: "文本" }[type]}字段；也可以重新导入并修正字段类型。`);
  const base: Plan = { title: "", groupBy: map.category, metric: map.amount, aggregate: "sum", chart: "bar", timeGrain: "month", sort: "desc", limit: 10, filters: [] };
  const plans: Plan[] = [
    { ...base, title: `${template.title} · 月度趋势`, groupBy: map.date, chart: "line", sort: "natural", limit: 30 },
    { ...base, title: `${template.title} · ${map.category}对比` },
    { ...base, title: `${template.title} · ${map.category}构成`, chart: "pie" },
  ];
  const warnings: string[] = [];
  for (const plan of plans) { validatePlan(plan, profile); executePlan(dataset, profile, plan); }
  const distribution = executePlan(dataset, profile, plans[2]);
  if (distribution.points.some(p => p.value < 0) || !distribution.points.some(p => p.value > 0)) { plans[2] = { ...plans[2], chart: "bar", title: `${template.title} · ${map.category}金额明细` }; warnings.push("金额包含负值或无正值，构成图将使用柱状图，避免误导占比。"); }
  const rules: BusinessRule[] = Object.values(map).map((field, index) => ({ id: `template-${id}-${index}`, field, kind: "required" }));
  return { title: `${template.title}报告`, plans, rules, warnings };
}
export function templatePins(plans: Plan[], prefix: string): PinnedInsight[] {
  return plans.map((plan, i) => ({ id: `${prefix}-${i}`, name: plan.title, createdAt: new Date().toISOString(), note: "场景模板：按全量数据统计。核对日期覆盖范围与缺失情况后，再解释变化；图表展示前 N 组。", plan }));
}
