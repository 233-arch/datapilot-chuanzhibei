import {
  type Dataset, type Profile, type Plan, type FilterClause,
  demoPlan, executePlan, filterDataset, filtersForPlan, mergeFilters,
  profileDataset, numeric, formatNumber, validatePlan,
} from "./data-engine";

export type LocalAction = "quality" | "preview" | "delivery" | "diagnostics" | "help";
export type LocalReply = { kind: "reply"; title: string; lines: string[]; action?: LocalAction };
export type LocalResponse = LocalReply | { kind: "plan"; plan: Plan; retrieved: string[] };
const labels = { sum: "合计", mean: "均值", max: "最大值", min: "最小值", count: "记录数" };
const reply = (title: string, lines: string[], action?: LocalAction): LocalReply => ({ kind: "reply", title, lines, action });

/** Deterministic browser-only help and analytics. Never calls a model or a network API. */
export function localAssistant(question: string, dataset: Dataset, profile: Profile, previous: Plan): LocalResponse {
  const q = question.trim().toLowerCase();
  const examples = profile.fields.filter(f => f.type === "number").map(f => f.name).slice(0, 3);
  const unsupported = (message: string) => reply("换一种明确的问法", [message,
    examples.length ? `可用指标：${examples.join("、")}。例如“${examples[0]}合计”或“改成均值”。` : "可以按文本字段统计记录数，或查看数据概览、质量摘要。",
    "本地助手使用固定规则，不执行代码、不推断因果或预测。复杂语义可接入个人 API。"], "help");
  if (!q || q.length > 2000) return unsupported("请输入1至2000字的问题。");
  if (/预测|因果|为什么|原因|删除|执行.*代码|运行.*代码|sql/.test(q))
    return reply("本地能力范围", ["可以核对已计算的数值、筛选与来源；不能预测、解释因果、执行代码或删除数据。", "变化问题可打开本地周期对比核查，结论需结合业务判断。"], "diagnostics");
  if (/^(你好[！!。]?|您好[！!。]?|hi|hello)$/.test(q) || /怎么用|如何使用|使用帮助|能做什么|帮助/.test(q))
    return reply("不接 API 也能开始分析", ["我可以直接统计当前数据、检查缺失和重复、查看字段，并按规则生成图表计划。", "试试“数据概览”“质量摘要”“查看字段”，或者“按地区统计销售额合计”“改成均值”“只看华南”。", "筛选和图表计划先供你核对；应用后才改变分析范围。报告可从洞察报告导出。"], "help");
  if (/导出|下载.*报告|生成.*报告/.test(q))
    return reply("导出当前分析", ["打开报告中心，可预览并导出当前计算结果、来源和分析口径。", "报告可能包含分类标签和批注，导出前请核对内容。"], "delivery");
  if (/环比|同比|周期对比|变化贡献/.test(q))
    return reply("使用本地周期对比", ["业务诊断可在不接API时计算本期、基期、差额和分组贡献。", "打开后选择真实日期字段、数值指标及两个周期，按数据覆盖范围核对结果。"], "diagnostics");

  const scoped = filterDataset(dataset, filtersForPlan(previous), profile);
  const scopeText = `当前筛选范围 ${scoped.rows.length.toLocaleString()} / ${dataset.rows.length.toLocaleString()} 条记录`;
  if (/查看字段|字段说明|有哪些字段|数据结构|列名/.test(q))
    return reply("当前数据的字段", [scopeText, ...profile.fields.map(f =>
      `${f.name}：${({ number: "数值", date: "日期", text: "文本" })[f.type]}${f.unit ? `，单位${f.unit}` : ""}${f.aliases?.length ? `；别名：${f.aliases.join("、")}` : ""}${f.description ? `；${f.description}` : ""}`,
    )], "preview");
  if (/是什么|什么意思|表示什么|什么单位|单位是/.test(q)) {
    const field = profile.fields.find(f => [f.name, ...(f.aliases || [])].some(name => q.includes(name.toLowerCase())));
    return field ? reply(`${field.name}的字段说明`, [
      `字段类型：${({ number: "数值", date: "日期", text: "文本" })[field.type]}；单位：${field.unit || "未定义"}。`,
      field.description || "尚未填写业务定义。可在字段字典中补充解释，本地助手不会猜测业务含义。",
    ], "preview") : unsupported("没有识别到要解释的字段，请使用实际字段名或别名。");
  }
  if (/质量|缺失|重复|无效值|空值/.test(q)) {
    const local = profileDataset({ ...scoped, types: Object.fromEntries(profile.fields.map(f => [f.name, f.type])) });
    const invalid = local.fields.reduce((sum, f) => sum + f.invalid, 0);
    return reply("当前范围的质量摘要", [scopeText,
      `完整率 ${local.completeness.toFixed(2)}%；缺失单元格 ${local.missing} 个；无效值 ${invalid} 个；完全重复记录 ${local.duplicates} 条。`,
      ...local.fields.filter(f => f.missing || f.invalid).map(f => `${f.name}：缺失 ${f.missing}，无效 ${f.invalid}。`),
      "缺失和无效数值不当作零；重复记录默认保留。质量页检查全量原始文件，清洗需你确认并可撤销。"], "quality");
  }
  if (/数据概览|数据摘要|介绍.*数据|这份数据|这张表|多少行|多少列|总共.*条/.test(q))
    return reply("当前数据概览", [scopeText,
      `${profile.columnCount} 个字段：${profile.fields.filter(f => f.type === "number").length} 个数值、${profile.fields.filter(f => f.type === "date").length} 个日期，其余为文本。`,
      ...profile.fields.filter(f => f.type === "number").slice(0, 3).map(f => {
        const values = scoped.rows.map(row => numeric(row[f.name])).filter((v): v is number => v !== null);
        return `${f.name}合计 ${formatNumber(values.reduce((sum, v) => sum + v, 0))}${f.unit || ""}；有效 ${values.length} 条，排除 ${scoped.rows.length - values.length} 条。`;
      }), "统计基于当前筛选范围，原始数据不被修改。"], "preview");

  const matched = profile.fields.filter(f => [f.name, ...(f.aliases || [])].some(name => q.includes(name.toLowerCase())));
  const metrics = matched.filter(f => f.type === "number");
  const dimensions = matched.filter(f => f.type !== "number");
  if (metrics.length > 1 || dimensions.length > 1) return unsupported("一次请选择一个分组字段和一个数值指标；多字段业务分析可使用业务诊断。");
  if (/率|每单/.test(q) && !metrics.some(f => /率|每单/.test(f.name))) return unsupported("该问题涉及比率，不能把已有金额字段直接当作比率。请使用指标库明确分子、分母。");
  const followup = /改成|换成|继续|再看|再按|只看|只要|筛选|过滤|清除|重置|不筛选|全部数据|恢复全部/.test(q);
  const trend = /趋势|每月|按月|月度|每日|每天|按日/.test(q);
  if (/\d{4}[-/年]\d{1,2}|\d{1,2}月/.test(q)) return unsupported("日期区间请先在联动筛选面板中设置，再继续提问；本地计算会继承已选范围。");
  if (trend && !profile.fields.some(f => f.type === "date")) return unsupported("当前数据没有日期字段，无法生成时间趋势。");
  if (/按|按照/.test(q) && !dimensions.length && !trend && !/按金额|按数值/.test(q)) return unsupported("没有识别到你要分组的字段，请使用表中实际的字段名。");
  let filters: FilterClause[] = filtersForPlan(previous);
  const reset = /清除.*筛选|重置.*筛选|不筛选|全部数据|恢复全部/.test(q);
  if (reset) filters = [];
  if (/不看|排除|或者|或是|不等于|大于(?!等于)|小于(?!等于)/.test(q)) return unsupported("本地筛选支持分类等值、数值“大于等于/小于等于”；排除、严格大于小于及OR条件请用筛选面板明确设置。");
  let categoryFound = false;
  if (!reset) for (const field of profile.fields.filter(f => f.type === "text")) {
    const hits = [...new Set(dataset.rows.map(row => String(row[field.name] ?? "")))].filter(value =>
      value.trim() && value.length <= 200 && !profile.fields.some(f => f.name === value) && q.includes(value.toLowerCase()),
    ).sort((a, b) => b.length - a.length).filter((value, index, all) => !all.slice(0, index).some(longer => longer.includes(value)));
    if (hits.length > 1) return unsupported(`“${field.name}”匹配到多个分类，请一次选择一个，或使用筛选面板。`);
    if (hits[0]) {
      if (!q.includes(field.name.toLowerCase()) && matched.some(other => other.type === "text" && other.name !== field.name && dataset.rows.some(row => String(row[other.name] ?? "") === hits[0]))) continue;
      const ambiguous = !q.includes(field.name.toLowerCase()) && profile.fields.some(other => other.type === "text" && other.name !== field.name && dataset.rows.some(row => String(row[other.name] ?? "") === hits[0]));
      if (ambiguous) return unsupported(`分类值“${hits[0]}”出现在多个字段，请同时写出要筛选的字段名。`);
      categoryFound = true; filters = mergeFilters(filters, [{ field: field.name, operator: "eq", value: hits[0] }]);
    }
  }
  if (!reset && /只看|只要|筛选|过滤/.test(q) && !categoryFound && !/大于等于|小于等于|至少|至多|>=|<=/.test(q))
    return unsupported("没有在原表中找到对应分类值。可用图表来源或筛选面板选择实际分类。");
  for (const range of q.matchAll(/(大于等于|小于等于|至少|至多|>=|<=)\s*([-+]?\d+(?:\.\d+)?)/g)) {
    if (!metrics[0]) return unsupported("请在数值条件中写出实际指标名。");
    filters = mergeFilters(filters, [{ field: metrics[0].name, operator: /小于等于|至多|<=/.test(range[1]) ? "lte" : "gte", value: range[2] }]);
  }
  if (!matched.length && !followup && !categoryFound && !trend && !/记录数|多少条|计数/.test(q))
    return unsupported("没有识别到当前表中的字段或常用统计操作。");
  if (!metrics.length && !followup && /合计|平均|均值|求和|总额/.test(q) && !/记录数|计数/.test(q))
    return unsupported("没有识别到该问题的数值指标，请使用表中实际指标或字段字典中的别名。");
  const plan = demoPlan(q, profile, previous);
  if (followup && !dimensions.length && !trend) plan.groupBy = previous.groupBy;
  plan.filter = undefined; plan.filters = filters;
  if (/合计|求和|总和|总计|总额/.test(q)) plan.aggregate = "sum";
  if (/记录数|多少条|计数/.test(q)) { plan.aggregate = "count"; plan.metric = ""; }
  if (plan.aggregate !== "count" && !plan.metric) plan.metric = metrics[0]?.name || profile.fields.find(f => f.type === "number")?.name || "";
  if (/最低|最少|升序|从低到高/.test(q)) plan.sort = "asc";
  if (/折线图/.test(q)) plan.chart = "line";
  if (/柱状图/.test(q)) plan.chart = "bar";
  plan.title = `${plan.groupBy} · ${plan.aggregate === "count" ? "记录数" : plan.metric + labels[plan.aggregate]}${plan.chart === "line" ? "趋势" : plan.chart === "pie" ? "占比" : "对比"}`;
  try { validatePlan(plan, profile); } catch { return unsupported("当前表缺少该统计所需的数值字段或分组字段。"); }
  if (metrics.length && !dimensions.length && !trend && !followup && !/分组|占比|前\s*\d|top/.test(q)) {
    let remainder = q;
    for (const name of [metrics[0].name, ...(metrics[0].aliases || [])]) remainder = remainder.split(name.toLowerCase()).join("");
    remainder = remainder.replace(/请问|帮我|请|计算|统计|查看|的|总共|全部|所有|合计|求和|总和|总计|总额|平均值|平均|均值|最大值|最小值|最高值|最低值|是多少|多少|为多少|值|[\s，,。？?！!]/g, "");
    if (remainder && !categoryFound && !rangePresent(q)) return unsupported("问题中还有未识别的范围或条件，请先使用筛选面板明确范围。");
    const values = filterDataset(dataset, filters, profile).rows.map(row => numeric(row[plan.metric])).filter((v): v is number => v !== null);
    if (plan.aggregate !== "count") {
      const sum = values.reduce((total, value) => total + value, 0);
      const value = !values.length ? null : plan.aggregate === "mean" ? sum / values.length : plan.aggregate === "max" ? Math.max(...values) : plan.aggregate === "min" ? Math.min(...values) : sum;
      const count = filterDataset(dataset, filters, profile).rows.length;
      return reply(`${plan.metric}${labels[plan.aggregate]}`, [`当前请求范围 ${count} / ${dataset.rows.length} 条记录。`,
        `结果：${value === null ? "无有效数值" : formatNumber(value)}${value === null ? "" : metrics[0].unit || ""}。`,
        `有效 ${values.length} 条，排除 ${count - values.length} 条缺失或无效指标；按${labels[plan.aggregate]}计算，不修改图表口径。`], "preview");
    }
  }
  try { executePlan(dataset, profile, plan); } catch { return unsupported("该图表无法用于当前数据，请尝试柱状图或调整统计口径。"); }
  return { kind: "plan", plan, retrieved: [...new Set([plan.groupBy, plan.metric, ...filters.map(f => f.field)].filter(Boolean))] };
}
const rangePresent = (q: string) => /大于等于|小于等于|至少|至多|>=|<=/.test(q);
