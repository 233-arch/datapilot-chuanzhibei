import {
  type Dataset,
  type Profile,
  type Plan,
  type FilterClause,
  numeric,
  filterDataset,
  dateBucket,
  formatNumber,
} from "./data-engine";
export type Fact = {
  id: string;
  title: string;
  value: number | null;
  unit: string;
  detail: string;
  group?: string;
};
export type Clarification = {
  question: string;
  reason: string;
  choices: { label: string; question: string }[];
};
export function clarifyQuestion(
  q: string,
  p: Profile,
  dataset: Dataset,
): Clarification | null {
  const metrics = p.fields.filter((f) => f.type === "number");
  const hasMetric = metrics.some((f) =>
    [f.name, ...(f.aliases || [])].some((n) =>
      q.toLowerCase().includes(n.toLowerCase()),
    ),
  );
  if (
    /表现最好|表现最差|表现如何|业绩如何|哪个.+最好|哪个.+最差/.test(q) &&
    !hasMetric &&
    !/记录数|订单数/.test(q)
  ) {
    return {
      question: q,
      reason: "“表现”需要明确衡量指标，请先选择分析口径。",
      choices: [
        ...metrics
          .slice(0, 4)
          .map((f) => ({
            label: f.name + "合计",
            question: q + "，以" + f.name + "合计为指标",
          })),
        { label: "记录数", question: q + "，按记录数衡量" },
      ],
    };
  }
  const date = p.fields.find((f) => f.type === "date");
  if (date && /最近|近期|本月|上月/.test(q) && !/\d{4}-\d{2}/.test(q)) {
    const days = dataset.rows
      .map((r) => dateBucket(String(r[date.name] ?? ""), "day"))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (days.length) {
      const latest = days[days.length - 1],
        end = new Date(latest + "T00:00:00Z");
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      const month = latest.slice(0, 7),
        last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0));
      const clean = q.replace(/最近|近期|本月|上月/g, "指定期间");
      return {
        question: q,
        reason: "时间以数据中最新日期 " + latest + " 为锚点，请确认范围。",
        choices: [
          {
            label: "数据最新月份 " + month,
            question:
              clean + "；" + date.name + "从" + month + "-01到" + latest,
          },
          {
            label: "截至最新日期的30天",
            question:
              clean +
              "；" +
              date.name +
              "从" +
              start.toISOString().slice(0, 10) +
              "到" +
              latest,
          },
          {
            label: "最新月份的上一月",
            question:
              clean +
              "；" +
              date.name +
              "从" +
              last.toISOString().slice(0, 7) +
              "-01到" +
              last.toISOString().slice(0, 10),
          },
        ],
      };
    }
  }
  return null;
}
export function analysisFacts(
  result: {
    points: { name: string; value: number; count: number }[];
    matchedRows: number;
    validRows: number;
    excluded: number;
  },
  plan: Plan,
): Fact[] {
  return [
    {
      id: "rows",
      title: "参与计算",
      value: result.validRows,
      unit: "条",
      detail:
        "筛选匹配 " +
        result.matchedRows +
        " 条；排除无效指标 " +
        result.excluded +
        " 条。",
    },
    ...result.points
      .slice(0, 12)
      .map((point, i) => ({
        id: "group-" + i,
        title: point.name,
        value: point.value,
        unit: plan.aggregate === "count" ? "条" : "",
        group: point.name,
        detail:
          plan.groupBy +
          "分组；" +
          (plan.metric || "记录数") +
          " / " +
          plan.aggregate +
          "；有效记录 " +
          point.count +
          " 条。",
      })),
  ];
}
export type Period = { start: string; end: string };
export type ComparisonInput = {
  date: string;
  metric: string;
  dimension: string;
  current: Period;
  previous: Period;
  filters: FilterClause[];
};
export type PeriodComparison = {
  current: number;
  previous: number;
  delta: number;
  growth: number | null;
  currentRows: number;
  previousRows: number;
  excluded: number;
  missingDates: number;
  groups: { name: string; current: number; previous: number; delta: number }[];
  facts: Fact[];
  warnings: string[];
};
export function validDay(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s
  );
}
export function periodDefaults(
  d: Dataset,
  date: string,
  year = false,
): { current: Period; previous: Period } {
  const days = d.rows
    .map((r) => dateBucket(String(r[date] ?? ""), "day"))
    .filter(validDay)
    .sort();
  const last = days.at(-1) || new Date().toISOString().slice(0, 10),
    end = new Date(last + "T00:00:00Z");
  const start = last.slice(0, 7) + "-01";
  if (year) {
    const y = end.getUTCFullYear() - 1,
      m = end.getUTCMonth(),
      day = Math.min(
        end.getUTCDate(),
        new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
      );
    return {
      current: { start, end: last },
      previous: {
        start: String(y) + start.slice(4),
        end: new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10),
      },
    };
  }
  const prevEnd = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0),
  );
  return {
    current: { start, end: last },
    previous: {
      start: prevEnd.toISOString().slice(0, 7) + "-01",
      end: prevEnd.toISOString().slice(0, 10),
    },
  };
}
export function comparePeriods(
  d: Dataset,
  p: Profile,
  input: ComparisonInput,
): PeriodComparison {
  if (
    p.fields.find((f) => f.name === input.date)?.type !== "date" ||
    p.fields.find((f) => f.name === input.metric)?.type !== "number" ||
    !d.columns.includes(input.dimension)
  )
    throw new Error("请正确选择日期、数值指标和分解维度。");
  for (const range of [input.current, input.previous])
    if (
      !validDay(range.start) ||
      !validDay(range.end) ||
      range.start > range.end
    )
      throw new Error("周期日期无效，开始日期必须早于结束日期。");
  if (
    input.current.start <= input.previous.end &&
    input.previous.start <= input.current.end
  )
    throw new Error("两个比较周期不能重叠。");
  const scope = filterDataset(d, input.filters, p),
    groups = new Map<
      string,
      { name: string; current: number; previous: number; delta: number }
    >();
  let current = 0,
    previous = 0,
    currentRows = 0,
    previousRows = 0,
    excluded = 0,
    missingDates = 0;
  const dates = new Set<string>();
  for (const row of scope.rows) {
    const day = dateBucket(String(row[input.date] ?? ""), "day");
    if (!validDay(day)) {
      missingDates++;
      continue;
    }
    dates.add(day);
    const bucket =
      day >= input.current.start && day <= input.current.end
        ? "current"
        : day >= input.previous.start && day <= input.previous.end
          ? "previous"
          : null;
    if (!bucket) continue;
    const value = numeric(row[input.metric]);
    if (value === null) {
      excluded++;
      continue;
    }
    const name = String(row[input.dimension] ?? "未填写"),
      g = groups.get(name) || { name, current: 0, previous: 0, delta: 0 };
    g[bucket] += value;
    groups.set(name, g);
    if (bucket === "current") {
      current += value;
      currentRows++;
    } else {
      previous += value;
      previousRows++;
    }
  }
  if (!Number.isFinite(current) || !Number.isFinite(previous))
    throw new Error("数值超出计算范围，请检查原始数据。");
  const delta = current - previous,
    growth = previous > 0 ? delta / previous : null;
  const sorted = [...groups.values()]
    .map((g) => ({ ...g, delta: g.current - g.previous }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const warnings: string[] = [];
  if (!currentRows || !previousRows)
    warnings.push("至少一个周期没有有效指标记录，暂不形成变化结论。");
  if (previous <= 0) warnings.push("基期为零或负数，增长率不适用。");
  if (input.filters.some((f) => f.field === input.date))
    warnings.push("全局日期筛选仍然生效，可能截断比较周期。");
  const duration = (range: Period) =>
    (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1;
  if (duration(input.current) !== duration(input.previous))
    warnings.push("两个周期天数不同，合计差额可能受覆盖时长影响。");
  for (const [label, range] of [
    ["本期", input.current],
    ["基期", input.previous],
  ] as const) {
    const ds = [...dates].filter((s) => s >= range.start && s <= range.end);
    if (ds.length < duration(range))
      warnings.push(
        label +
          "部分日期没有记录；这可能是未发生业务或数据缺失，请核对完整性。",
      );
  }
  if (missingDates)
    warnings.push("日期缺失或无效 " + missingDates + " 条，未进入周期计算。");
  const facts: Fact[] = [
    {
      id: "current",
      title: "本期合计",
      value: current,
      unit: "",
      detail:
        input.current.start +
        " 至 " +
        input.current.end +
        "；有效 " +
        currentRows +
        " 条",
    },
    {
      id: "previous",
      title: "基期合计",
      value: previous,
      unit: "",
      detail:
        input.previous.start +
        " 至 " +
        input.previous.end +
        "；有效 " +
        previousRows +
        " 条",
    },
    {
      id: "delta",
      title: "变化金额",
      value: delta,
      unit: "",
      detail: "本期合计减去基期合计；按全部分组计算。",
    },
    {
      id: "growth",
      title: "增长率",
      value: growth === null ? null : growth * 100,
      unit: "%",
      detail:
        previous > 0
          ? "差额 / 基期合计 × 100%；仅描述变化。"
          : "基期为零或负数，不计算增长率。",
    },
    ...sorted
      .slice(0, 10)
      .map((g, i) => ({
        id: "contribution-" + i,
        title: g.name + "的增减贡献",
        value: g.delta,
        unit: "",
        group: g.name,
        detail:
          "本期 " +
          formatNumber(g.current) +
          "；基期 " +
          formatNumber(g.previous) +
          "。这是分组差额，业务原因仍需核查。",
      })),
  ];
  return {
    current,
    previous,
    delta,
    growth,
    currentRows,
    previousRows,
    excluded,
    missingDates,
    groups: sorted,
    facts,
    warnings,
  };
}
export function ratioMetric(
  d: Dataset,
  numerator: string,
  denominator: string,
  kind: "ratio" | "distinct" = "ratio",
) {
  if (!d.columns.includes(numerator) || !d.columns.includes(denominator))
    throw new Error("指标字段不存在。");
  let top = 0,
    bottom = 0,
    valid = 0,
    excluded = 0;
  const ids = new Set<string>();
  for (const row of d.rows) {
    const a = numeric(row[numerator]);
    const b = kind === "ratio" ? numeric(row[denominator]) : row[denominator];
    if (a === null || b === null || b === "") {
      excluded++;
      continue;
    }
    top += a;
    valid++;
    if (kind === "ratio") bottom += b as number;
    else ids.add(String(b));
  }
  if (kind === "distinct") bottom = ids.size;
  if (!Number.isFinite(top) || !Number.isFinite(bottom))
    throw new Error("指标数值超出计算范围。");
  return {
    value: valid && bottom !== 0 ? top / bottom : null,
    numerator: top,
    denominator: bottom,
    valid,
    excluded,
    formula:
      kind === "ratio"
        ? "匹配完整记录的分子合计 / 分母合计"
        : "匹配完整记录的分子合计 / 去重标识数",
  };
}
export function collapseWaterfall(groups: PeriodComparison["groups"], max = 8) {
  if (groups.length <= max) return groups;
  const head = groups.slice(0, max - 1),
    tail = groups.slice(max - 1);
  return [
    ...head,
    {
      name: "其余 " + tail.length + " 组",
      current: tail.reduce((s, g) => s + g.current, 0),
      previous: tail.reduce((s, g) => s + g.previous, 0),
      delta: tail.reduce((s, g) => s + g.delta, 0),
    },
  ];
}
export function rangeFilters(
  plan: Plan,
  start: string,
  end: string,
): FilterClause[] {
  if (!validDay(start) || !validDay(end) || start > end)
    throw new Error("时间范围无效。");
  return [
    { field: plan.groupBy, operator: "gte", value: start },
    { field: plan.groupBy, operator: "lte", value: end },
  ];
}
