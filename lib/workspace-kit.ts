import { z } from "zod";
import {
  type Dataset,
  type Profile,
  type Plan,
  executePlan,
  filtersForPlan,
  validatePlan,
  mergeFilters,
  groupFilter,
} from "./data-engine";
import { type PinnedInsight } from "./exploration";
export const definitionSchema = z
  .object({
    description: z.string().max(300),
    aliases: z.array(z.string().trim().min(1).max(40)).max(8),
    unit: z.string().max(20),
  })
  .strict();
export type FieldDefinition = z.infer<typeof definitionSchema>;
export type Dictionary = Record<string, FieldDefinition>;
export function validateDictionary(
  value: unknown,
  columns: string[],
): Dictionary {
  const parsed = z.record(definitionSchema).parse(value);
  if (
    Object.keys(parsed).some(
      (name) =>
        !columns.includes(name) ||
        ["__proto__", "constructor", "prototype"].includes(name),
    )
  )
    throw new Error("字段字典包含当前文件不存在的字段。");
  const used = new Map<string, string>();
  for (const name of columns) used.set(name.toLowerCase(), name);
  for (const [name, def] of Object.entries(parsed))
    for (const alias of def.aliases) {
      const key = alias.toLowerCase(),
        owner = used.get(key);
      if (owner && owner !== name)
        throw new Error(`别名“${alias}”同时指向多个字段，请消除歧义。`);
      used.set(key, name);
    }
  return parsed;
}
export function enrichProfile(
  profile: Profile,
  dictionary: Dictionary,
): Profile {
  return {
    ...profile,
    fields: profile.fields.map((f) => ({ ...f, ...dictionary[f.name] })),
  };
}
export function drillPlan(
  plan: Plan,
  group: string,
  nextField: string,
  profile: Profile,
): Plan {
  const field = profile.fields.find(
    (f) => f.name === nextField && f.type !== "number",
  );
  if (!field || field.name === plan.groupBy)
    throw new Error("请选择另一个分类或日期字段继续分析。");
  const next: Plan = {
    ...plan,
    groupBy: nextField,
    filters: mergeFilters(filtersForPlan(plan), [
      groupFilter(plan, group, profile),
    ]),
    filter: undefined,
    chart: field.type === "date" ? "line" : "bar",
    sort: field.type === "date" ? "natural" : "desc",
    title: `${group} · 按${nextField}继续分析`,
  };
  validatePlan(next, profile);
  return next;
}
const importedPlanSchema = z
  .object({
    title: z.string().min(1).max(100),
    chart: z.enum(["bar", "line", "pie"]),
    groupBy: z.string().max(100),
    metric: z.string().max(100),
    aggregate: z.enum(["sum", "mean", "count", "min", "max"]),
    timeGrain: z.enum(["day", "month"]),
    sort: z.enum(["asc", "desc", "natural"]),
    limit: z.number().int().min(1).max(30),
    filter: z
      .object({
        field: z.string().max(100),
        operator: z.enum(["eq", "contains", "gte", "lte"]),
        value: z.string().max(200),
      })
      .strict()
      .optional(),
    filters: z
      .array(
        z
          .object({
            field: z.string().max(100),
            operator: z.enum([
              "eq",
              "contains",
              "gte",
              "lte",
              "missing",
              "bucket",
              "group",
            ]),
            value: z.string().max(200),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();
const recipeSchema = z
  .object({
    format: z.literal("datapilot-recipe"),
    version: z.literal(1),
    source: z
      .object({
        name: z.string().max(250),
        rows: z.number().int().min(1).max(20000),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    plan: importedPlanSchema,
    dictionary: z.record(definitionSchema),
    pins: z
      .array(
        z
          .object({
            id: z.string().max(100),
            name: z.string().max(100),
            note: z.string().max(1000),
            createdAt: z.string().max(50),
            plan: importedPlanSchema,
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
/** A content hash binds recipes to the same table, without exporting its rows. */
export async function datasetFingerprint(dataset: Dataset): Promise<string> {
  const canonical = JSON.stringify([
    dataset.columns,
    dataset.rows.map((row) =>
      dataset.columns.map((c) => (row[c] === null ? null : String(row[c]))),
    ),
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function exportRecipe(
  dataset: Dataset,
  profile: Profile,
  plan: Plan,
  dictionary: Dictionary,
  pins: PinnedInsight[],
): Promise<string> {
  validatePlan(plan, profile);
  const recipe = recipeSchema.parse({
    format: "datapilot-recipe",
    version: 1,
    source: {
      name: dataset.name,
      rows: dataset.rows.length,
      fingerprint: await datasetFingerprint(dataset),
    },
    plan,
    dictionary: validateDictionary(dictionary, dataset.columns),
    pins,
  });
  return JSON.stringify(recipe, null, 2);
}
export async function importRecipe(
  text: string,
  dataset: Dataset,
  profile: Profile,
) {
  if (new TextEncoder().encode(text).length > 100000)
    throw new Error("分析配置超过 100 KB。");
  let parsed;
  try {
    parsed = recipeSchema.parse(JSON.parse(text));
  } catch {
    throw new Error("分析配置格式不正确，或版本不受支持。");
  }
  if (
    parsed.source.rows !== dataset.rows.length ||
    parsed.source.fingerprint !== (await datasetFingerprint(dataset))
  )
    throw new Error(
      "此配置属于另一份数据，请先导入原始 CSV；当前工作空间未改变。",
    );
  validatePlan(parsed.plan, profile);
  parsed.pins.forEach((pin) => validatePlan(pin.plan, profile));
  return {
    ...parsed,
    dictionary: validateDictionary(parsed.dictionary, dataset.columns),
  };
}
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const filterLabels = {
  eq: "等于",
  contains: "包含",
  gte: "不小于 / 起始",
  lte: "不大于 / 截止",
  missing: "为空",
  bucket: "时间分组",
  group: "图表分组",
};
/** Self-contained, script-free HTML; all user-controlled text is escaped. */
export function reportHTML(
  dataset: Dataset,
  profile: Profile,
  analyses: { plan: Plan; note?: string; mode?: string }[],
  dictionary: Dictionary,
): string {
  const e = escapeHtml;
  const sections = analyses
    .slice(0, 30)
    .map(({ plan, note, mode }, index) => {
      const result = executePlan(dataset, profile, plan);
      const max = Math.max(1, ...result.points.map((p) => Math.abs(p.value)));
      const graph = result.points
        .map(
          (p, i) =>
            `<g><text x="8" y="${30 + i * 31}" font-size="12">${e(p.name.slice(0, 18))}</text><rect x="200" y="${14 + i * 31}" width="${(Math.abs(p.value) / max) * 300}" height="21" fill="${p.value < 0 ? "#aa723b" : "#118a74"}" rx="3"/><text x="${208 + (Math.abs(p.value) / max) * 300}" y="${30 + i * 31}" font-size="12">${e(p.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 }))}</text></g>`,
        )
        .join("");
      return `<section><p class="eyebrow">洞察 ${String(index + 1).padStart(2, "0")} · ${mode === "model" ? "模型规划" : mode === "demo" ? "演示规划" : "用户选择口径"} · 本地计算</p><h2>${e(plan.title)}</h2><p>${e(result.summary)}</p>${note ? `<blockquote>${e(note)}</blockquote>` : ""}<p class="scope">筛选范围：${e(
        filtersForPlan(plan)
          .map((f) => `${f.field} ${filterLabels[f.operator]} ${f.value}`)
          .join(" 且 ") || "全部记录",
      )}<br>匹配 ${result.matchedRows} 条 / 有效 ${result.validRows} 条 / 排除 ${result.excluded} 条 · 单位：${e(result.unit || "未指定")}</p>${result.points.length ? `<svg role="img" aria-label="${e(plan.title)}" viewBox="0 0 680 ${result.points.length * 31 + 12}" xmlns="http://www.w3.org/2000/svg">${graph}</svg><p class="hint">条形长度表示绝对值，数值标签保留正负号；负值用棕色标记。图表仅展示当前 Top N。</p>` : ""}<table><thead><tr><th>${e(plan.groupBy)}</th><th>${e(plan.aggregate === "count" ? "记录数" : plan.metric)}</th><th>有效记录</th></tr></thead><tbody>${result.points.map((p) => `<tr><td>${e(p.name)}</td><td>${e(p.value.toLocaleString("zh-CN", { maximumFractionDigits: 4 }))}</td><td>${p.count}</td></tr>`).join("")}</tbody></table><details><summary>查看计算口径（示意 SQL）</summary><pre>${e(result.sql)}</pre></details></section>`;
    })
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${e(dataset.name)} · 数问分析报告</title><style>body{margin:0;background:#f4f7f2;color:#243c32;font:15px/1.8 system-ui,'Microsoft YaHei',sans-serif}main{max-width:900px;margin:40px auto;padding:0 24px}header,section{background:white;padding:30px;border:1px solid #dfe8dc;border-radius:12px;margin:24px 0;overflow-wrap:anywhere}h1{font-size:32px}h2{font-size:22px;color:#0b715f}.eyebrow,.hint{font-size:12px;color:#64796b}.stats{display:flex;gap:30px;flex-wrap:wrap}.stats strong{display:block;font-size:25px}.scope,blockquote{background:#f0f6ec;padding:15px;border-radius:6px}svg{width:100%;max-height:950px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:9px;text-align:left;border-bottom:1px solid #dde6d8}th{background:#eef4e9}pre{white-space:pre-wrap;font-size:12px;background:#f7faf5;padding:16px}footer{font-size:12px;color:#627568;padding:20px 0}@media print{body{background:white}main{margin:0;max-width:none;padding:0}header,section{border-radius:0;break-inside:avoid;padding:18px}details{display:block}details pre{display:block}a{color:inherit}}@page{size:A4;margin:16mm}</style></head><body><main><header><p class="eyebrow">数问 DATAPILOT · 可核验的数据分析</p><h1>${e(dataset.name)}<br>分析报告</h1><p>生成时间：${e(new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}（北京时间）<br>来源：${dataset.source === "demo" ? "固定种子合成样本" : "用户上传文件"}</p><div class="stats"><div><strong>${profile.rowCount}</strong>原始记录</div><div><strong>${profile.columnCount}</strong>字段</div><div><strong>${profile.completeness.toFixed(2)}%</strong>完整率</div><div><strong>${profile.duplicates}</strong>完全重复</div></div></header>${sections}${
    Object.keys(dictionary).length
      ? `<section><h2>字段字典</h2><table><tr><th>字段</th><th>含义 / 别名</th><th>单位</th></tr>${Object.entries(
          dictionary,
        )
          .map(
            ([name, d]) =>
              `<tr><td>${e(name)}</td><td>${e(d.description)}<br>${e(d.aliases.join("、"))}</td><td>${e(d.unit)}</td></tr>`,
          )
          .join("")}</table></section>`
      : ""
  }<footer>本报告的数值和图表来自确定性聚合，不由模型估算。缺失及无效指标不参与数值聚合；重复记录保留，除非主动清洗。描述统计不推断因果，不构成预测。报告包含聚合数据与分类标签，分享前请核对权限。浏览器可使用打印功能保存为 PDF。</footer></main></body></html>`;
}
