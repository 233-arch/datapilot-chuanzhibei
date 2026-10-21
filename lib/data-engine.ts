/** Deterministic, browser-side analytics. Model output never runs as code or SQL. */
export type Cell = string | number | null;
export type DataRow = Record<string, Cell>;
export type FieldType = "number" | "date" | "text";
export type Field = {
  name: string;
  type: FieldType;
  missing: number;
  invalid: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
  topValues: { value: string; count: number }[];
};
export type Dataset = {
  id: string;
  name: string;
  columns: string[];
  rows: DataRow[];
  source: "demo" | "upload";
  createdAt: string;
};
export type Profile = {
  rowCount: number;
  columnCount: number;
  missing: number;
  duplicates: number;
  completeness: number;
  quality: number;
  fields: Field[];
};
export type Plan = {
  title: string;
  chart: "bar" | "line" | "pie";
  groupBy: string;
  metric: string;
  aggregate: "sum" | "mean" | "count" | "max" | "min";
  timeGrain: "day" | "month";
  sort: "asc" | "desc" | "natural";
  limit: number;
  filter?: {
    field: string;
    operator: "eq" | "contains" | "gte" | "lte";
    value: string;
  };
};
export type AnalysisResult = {
  points: { name: string; value: number; count: number }[];
  matchedRows: number;
  validRows: number;
  excluded: number;
  summary: string;
  sql: string;
  unit: string;
};
const badFields = new Set(["__proto__", "constructor", "prototype"]);
export const LIMITS = { bytes: 5 * 1024 * 1024, rows: 20000, columns: 80 };
export function numeric(value: Cell): number | null {
  if (
    value === null ||
    value === "" ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const v = value.trim().replace(/[¥￥$]/g, "");
  if (
    !/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+|\d*\.\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(
      v,
    )
  )
    return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function isDate(v: Cell): boolean {
  if (typeof v !== "string") return false;
  const m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return (
      d.getUTCFullYear() === Number(m[1]) &&
      d.getUTCMonth() === Number(m[2]) - 1 &&
      d.getUTCDate() === Number(m[3])
    );
  }
  return /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
}
function dateBucket(v: string, grain: "day" | "month"): string {
  const m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m)
    return `${m[1]}-${m[2].padStart(2, "0")}${grain === "day" ? "-" + m[3].padStart(2, "0") : ""}`;
  const d = new Date(v);
  return Number.isFinite(d.getTime())
    ? d.toISOString().slice(0, grain === "month" ? 7 : 10)
    : v;
}
export function parseCSV(input: string, filename = "我的数据.csv"): Dataset {
  if (new TextEncoder().encode(input).length > LIMITS.bytes)
    throw new Error("文件超过 5 MB，请精简后重试。");
  const text = input.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const delimiter = ["\t", ";", ","]
    .map((d) => ({ d, count: first.split(d).length }))
    .sort((a, b) => b.count - a.count)[0].d;
  const grid: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || value === "") quoted = !quoted;
      else throw new Error("CSV 引号格式不正确，请将含引号的单元格完整包裹。");
    } else if (c === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((x) => x.trim() !== "")) grid.push(row);
      row = [];
      value = "";
    } else value += c;
    if (grid.length > LIMITS.rows + 1)
      throw new Error("最多支持 20,000 行，请拆分文件。");
  }
  if (quoted) throw new Error("CSV 存在未闭合的引号。");
  row.push(value);
  if (row.some((x) => x.trim() !== "")) grid.push(row);
  if (grid.length < 2) throw new Error("请上传包含表头和至少一行数据的 CSV。");
  const columns = grid[0].map((x, i) => x.trim() || `列${i + 1}`);
  if (columns.length > LIMITS.columns) throw new Error("最多支持 80 个字段。");
  if (new Set(columns).size !== columns.length)
    throw new Error("存在重名字段，请先为每列设置唯一名称。");
  if (columns.some((x) => badFields.has(x) || x.length > 100))
    throw new Error("字段名称不合法或超过 100 个字符。");
  const rows = grid.slice(1).map((cells, index) => {
    if (cells.length !== columns.length)
      throw new Error(
        `第 ${index + 2} 行有 ${cells.length} 列，表头为 ${columns.length} 列，请检查分隔符。`,
      );
    const record: DataRow = Object.create(null);
    columns.forEach((col, i) => {
      const v = cells[i].trim();
      record[col] = v === "" ? null : v;
    });
    return record;
  });
  if (rows.length > LIMITS.rows) throw new Error("最多支持 20,000 行。");
  return {
    id: `upload-${Date.now()}`,
    name: filename,
    columns,
    rows,
    source: "upload",
    createdAt: new Date().toISOString(),
  };
}
export function profileDataset(dataset: Dataset): Profile {
  let missing = 0;
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of dataset.rows) {
    const key = JSON.stringify(dataset.columns.map((c) => row[c]));
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  const fields: Field[] = dataset.columns.map((name) => {
    const values = dataset.rows.map((r) => r[name]);
    const present = values.filter((v) => v !== null && v !== "");
    const nums = present.map(numeric).filter((v): v is number => v !== null);
    const type: FieldType =
      present.length && present.filter(isDate).length / present.length >= 0.9
        ? "date"
        : present.length && nums.length / present.length >= 0.8
          ? "number"
          : "text";
    const count = new Map<string, number>();
    present.forEach((v) =>
      count.set(String(v), (count.get(String(v)) || 0) + 1),
    );
    const field: Field = {
      name,
      type,
      missing: values.length - present.length,
      invalid: type === "number" ? present.length - nums.length : 0,
      unique: count.size,
      topValues: [...count]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count })),
    };
    missing += field.missing;
    if (type === "number" && nums.length) {
      field.min = nums.reduce((a, b) => Math.min(a, b), Infinity);
      field.max = nums.reduce((a, b) => Math.max(a, b), -Infinity);
      field.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    return field;
  });
  const completeness = dataset.rows.length
    ? 100 * (1 - missing / (dataset.rows.length * dataset.columns.length))
    : 100;
  return {
    rowCount: dataset.rows.length,
    columnCount: dataset.columns.length,
    missing,
    duplicates,
    completeness,
    quality: Math.max(
      0,
      completeness - (20 * duplicates) / Math.max(1, dataset.rows.length),
    ),
    fields,
  };
}
export function makeDemo(): Dataset {
  let seed = 20261021;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rows: DataRow[] = [];
  const regions = ["华东", "华南", "华北", "西南", "华中"];
  const categories = [
    "数码配件",
    "家居生活",
    "服装鞋包",
    "美妆个护",
    "食品饮料",
  ];
  for (let i = 0; i < 1248; i++) {
    const day = Math.floor(i / 7) % 178;
    const date = new Date(Date.UTC(2026, 3, 1 + day));
    const month = date.getUTCMonth() - 3;
    const region = regions[Math.floor(random() * regions.length)];
    const cat = categories[Math.floor(random() * categories.length)];
    const sales = Math.round(
      (180 + random() * 2200) *
        (1 + month * 0.085) *
        (region === "华东" ? 1.2 : 1),
    );
    rows.push({
      日期: date.toISOString().slice(0, 10),
      订单编号: `DP${String(i + 1).padStart(6, "0")}`,
      地区: region,
      产品类别: cat,
      渠道: ["线上商城", "线下门店", "社交电商"][Math.floor(random() * 3)],
      销售额: sales,
      利润: Math.round(sales * (0.12 + random() * 0.22)),
      订单量: 1 + Math.floor(random() * 4),
      客户类型: random() > 0.43 ? "回头客" : "新客户",
    });
  }
  [88, 240, 507, 1003].forEach((i) => {
    rows[i]["地区"] = null;
  });
  rows[322]["销售额"] = null;
  rows[701]["利润"] = null;
  rows.push({ ...rows[44] }, { ...rows[102] }, { ...rows[660] });
  return {
    id: "demo-retail",
    name: "零售经营数据_2026.csv",
    columns: Object.keys(rows[0]),
    rows,
    source: "demo",
    createdAt: "2026-10-21T00:00:00Z",
  };
}
export function defaultPlan(profile: Profile): Plan {
  const metric =
    profile.fields.find(
      (f) =>
        f.type === "number" && /销售|金额|revenue|sales|amount/i.test(f.name),
    ) || profile.fields.find((f) => f.type === "number");
  const group =
    profile.fields.find((f) => f.type === "date") ||
    profile.fields.find((f) => f.type === "text" && f.unique < 50) ||
    profile.fields[0];
  return {
    title: metric
      ? `${metric.name}${group?.type === "date" ? "月度趋势" : "分组分析"}`
      : "数据分布",
    chart: group?.type === "date" ? "line" : "bar",
    groupBy: group?.name || "",
    metric: metric?.name || "",
    aggregate: metric ? "sum" : "count",
    timeGrain: "month",
    sort: group?.type === "date" ? "natural" : "desc",
    limit: 12,
  };
}
/** Limited offline intent recognition; explicitly identified as demo, never a model. */
export function demoPlan(question: string, profile: Profile): Plan {
  const p = defaultPlan(profile);
  const q = question.toLowerCase();
  const matched = profile.fields.filter((f) =>
    q.includes(f.name.toLowerCase()),
  );
  const dimension = matched.find((f) => f.type !== "number");
  const metric = matched.find((f) => f.type === "number");
  if (dimension) p.groupBy = dimension.name;
  if (metric) p.metric = metric.name;
  if (/平均|均值|average|mean/.test(q)) p.aggregate = "mean";
  else if (/最大|最高值|max/.test(q)) p.aggregate = "max";
  else if (/最小|最低值|min/.test(q)) p.aggregate = "min";
  else if (/记录数|多少条|计数|count/.test(q)) {
    p.aggregate = "count";
    p.metric = "";
  }
  if (/趋势|月份|每月|月度|时间/.test(q)) {
    const date = profile.fields.find((f) => f.type === "date");
    if (date) p.groupBy = date.name;
    p.chart = "line";
    p.sort = "natural";
  } else if (/占比|比例|饼图/.test(q)) {
    p.chart = "pie";
    p.sort = "desc";
    if (!dimension) {
      const d = profile.fields.find((f) => f.type === "text" && f.unique < 30);
      if (d) p.groupBy = d.name;
    }
  } else if (dimension) {
    p.chart = "bar";
    p.sort = "desc";
  }
  if (/每天|每日|按日/.test(q)) p.timeGrain = "day";
  if (/升序|从低到高|最少/.test(q)) p.sort = "asc";
  const top = q.match(/(?:top|前)\s*(\d+)/i);
  if (top) p.limit = Math.max(1, Math.min(30, Number(top[1])));
  for (const f of profile.fields.filter((x) => x.type === "text")) {
    const v = f.topValues.find((v) => q.includes(v.value.toLowerCase()));
    if (v && f.name !== p.groupBy) {
      p.filter = { field: f.name, operator: "eq", value: v.value };
      break;
    }
  }
  p.title = `${p.groupBy} · ${p.aggregate === "count" ? "记录数" : p.metric}${p.aggregate === "mean" ? "均值" : ""}${p.chart === "line" ? "趋势" : p.chart === "pie" ? "占比" : "对比"}`;
  return p;
}
export function validatePlan(plan: Plan, profile: Profile): void {
  if (!profile.fields.some((f) => f.name === plan.groupBy))
    throw new Error("分析维度不在当前数据集中。");
  if (
    plan.aggregate !== "count" &&
    !profile.fields.some((f) => f.name === plan.metric && f.type === "number")
  )
    throw new Error("分析指标必须是当前数据集的数值字段。");
  if (
    !["bar", "line", "pie"].includes(plan.chart) ||
    !["sum", "mean", "count", "max", "min"].includes(plan.aggregate) ||
    !["day", "month"].includes(plan.timeGrain) ||
    !["asc", "desc", "natural"].includes(plan.sort) ||
    !Number.isInteger(plan.limit) ||
    plan.limit < 1 ||
    plan.limit > 30
  )
    throw new Error("分析计划不合法。");
  if (
    plan.filter &&
    (!profile.fields.some((f) => f.name === plan.filter!.field) ||
      !["eq", "contains", "gte", "lte"].includes(plan.filter.operator))
  )
    throw new Error("筛选条件不合法。");
}
export function executePlan(
  dataset: Dataset,
  profile: Profile,
  plan: Plan,
): AnalysisResult {
  validatePlan(plan, profile);
  const groups = new Map<
    string,
    { sum: number; count: number; min: number; max: number }
  >();
  let matchedRows = 0,
    validRows = 0;
  const date =
    profile.fields.find((f) => f.name === plan.groupBy)?.type === "date";
  for (const row of dataset.rows) {
    if (plan.filter) {
      const v = row[plan.filter.field];
      const target = plan.filter.value;
      const n = numeric(v),
        t = numeric(target);
      if (
        (plan.filter.operator === "eq" && String(v ?? "") !== target) ||
        (plan.filter.operator === "contains" &&
          !String(v ?? "").includes(target)) ||
        (plan.filter.operator === "gte" &&
          (n === null || t === null || n < t)) ||
        (plan.filter.operator === "lte" && (n === null || t === null || n > t))
      )
        continue;
    }
    matchedRows++;
    let key = String(row[plan.groupBy] ?? "未填写");
    if (date && row[plan.groupBy] !== null)
      key = dateBucket(String(row[plan.groupBy]), plan.timeGrain);
    const n = plan.aggregate === "count" ? 1 : numeric(row[plan.metric]);
    if (n === null) continue;
    validRows++;
    const old = groups.get(key) || {
      sum: 0,
      count: 0,
      min: Infinity,
      max: -Infinity,
    };
    old.sum += n;
    old.count++;
    old.min = Math.min(old.min, n);
    old.max = Math.max(old.max, n);
    groups.set(key, old);
  }
  let points = [...groups].map(([name, v]) => ({
    name,
    value:
      plan.aggregate === "mean"
        ? v.sum / v.count
        : plan.aggregate === "max"
          ? v.max
          : plan.aggregate === "min"
            ? v.min
            : v.sum,
    count: v.count,
  }));
  const totalGroups = points.length;
  const highest = [...points].sort((a, b) => b.value - a.value)[0];
  points.sort((a, b) =>
    plan.sort === "natural"
      ? a.name.localeCompare(b.name)
      : plan.sort === "asc"
        ? a.value - b.value
        : b.value - a.value,
  );
  points = points.slice(0, plan.limit);
  const aggregateName = {
    sum: "合计",
    mean: "平均值",
    count: "记录数",
    max: "最大值",
    min: "最小值",
  }[plan.aggregate];
  const summary = !highest
    ? "当前筛选条件下没有可用数据。"
    : `共分析 ${matchedRows.toLocaleString("zh-CN")} 条记录，${validRows.toLocaleString("zh-CN")} 条参与计算。按${plan.groupBy}分组后，${highest.name}的${plan.aggregate === "count" ? "记录数" : plan.metric + aggregateName}最高，为 ${formatNumber(highest.value)}${totalGroups > points.length ? `。当前展示 ${totalGroups} 组中的 ${points.length} 组` : ""}。${matchedRows > validRows ? `已排除 ${matchedRows - validRows} 条指标缺失或无效的记录。` : ""}`;
  const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
  const literal = (s: string) => "'" + s.replace(/'/g, "''") + "'";
  const groupExpr =
    date && plan.timeGrain === "month"
      ? `SUBSTR(${quote(plan.groupBy)}, 1, 7)`
      : quote(plan.groupBy);
  const expr =
    plan.aggregate === "count"
      ? "COUNT(*)"
      : `${plan.aggregate === "mean" ? "AVG" : plan.aggregate.toUpperCase()}(${quote(plan.metric)})`;
  const where = plan.filter
    ? `\nWHERE ${quote(plan.filter.field)} ${plan.filter.operator === "contains" ? "LIKE" : plan.filter.operator === "gte" ? ">=" : plan.filter.operator === "lte" ? "<=" : "="} ${literal(plan.filter.operator === "contains" ? "%" + plan.filter.value + "%" : plan.filter.value)}`
    : "";
  return {
    points,
    matchedRows,
    validRows,
    excluded: matchedRows - validRows,
    summary,
    sql: `-- 分析口径示意；实际计算由受限聚合引擎执行\nSELECT ${groupExpr} AS dimension, ${expr} AS value\nFROM current_dataset${where}\nGROUP BY ${groupExpr}\nORDER BY ${plan.sort === "natural" ? "dimension ASC" : `value ${plan.sort.toUpperCase()}`}\nLIMIT ${plan.limit};`,
    unit:
      plan.aggregate === "count"
        ? "条"
        : /额|金额|销售|利润|收入/.test(plan.metric)
          ? "元"
          : "",
  };
}
export function formatNumber(n: number, compact = false): string {
  if (compact && Math.abs(n) >= 10000)
    return `${(n / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}万`;
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
export function toCSV(dataset: Dataset): string {
  const escape = (v: Cell) => {
    const s = String(v ?? "");
    const safe = /^[=+@\-\t\r]/.test(s) && numeric(s) === null ? "'" + s : s;
    return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  return (
    "\uFEFF" +
    [
      dataset.columns.map(escape).join(","),
      ...dataset.rows.map((r) =>
        dataset.columns.map((c) => escape(r[c])).join(","),
      ),
    ].join("\r\n")
  );
}
export function cleanDataset(
  dataset: Dataset,
  options: { deduplicate: boolean; trim: boolean; fillMissing: boolean },
): Dataset {
  const seen = new Set<string>();
  const rows: DataRow[] = [];
  for (const original of dataset.rows) {
    const row: DataRow = Object.create(null);
    dataset.columns.forEach((c) => {
      const value = original[c];
      row[c] = options.trim && typeof value === "string" ? value.trim() : value;
      if (options.fillMissing && (row[c] === null || row[c] === ""))
        row[c] = "未填写";
    });
    const key = JSON.stringify(dataset.columns.map((c) => row[c]));
    if (options.deduplicate && seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return { ...dataset, id: `clean-${Date.now()}`, rows };
}
export function reportMarkdown(
  dataset: Dataset,
  profile: Profile,
  analyses: { plan: Plan; result: AnalysisResult }[],
): string {
  return `# ${dataset.name} · 数据分析报告\n\n生成时间：${new Date().toISOString()}\n\n## 数据概况\n\n- 数据来源：${dataset.source === "demo" ? "内置合成演示数据" : "用户上传数据"}\n- 记录数：${profile.rowCount}\n- 字段数：${profile.columnCount}\n- 缺失单元格：${profile.missing}\n- 重复记录：${profile.duplicates}\n- 完整率：${profile.completeness.toFixed(2)}%\n\n## 分析结果\n\n${analyses.map(({ plan, result }, i) => `### ${i + 1}. ${plan.title}\n\n${result.summary}\n\n| ${plan.groupBy} | ${plan.aggregate === "count" ? "记录数" : plan.metric} |\n| --- | ---: |\n${result.points.map((p) => `| ${p.name.replace(/\|/g, "/").replace(/\r?\n/g, " ")} | ${p.value.toFixed(2)} |`).join("\n")}\n\n\`\`\`sql\n${result.sql}\n\`\`\`\n`).join("\n")}\n## 口径与限制\n\n- 计算结果由确定性聚合引擎生成，非模型估算。\n- 指标缺失和非法数值不参与数值聚合；分组字段缺失显示为“未填写”。\n- 保留原始重复记录，除非用户主动执行清洗。\n- 趋势仅描述关联，不推断因果；导出前请核对业务口径。\n`;
}
