import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import {
  type Dataset,
  type Profile,
  type Plan,
  type FilterClause,
  filterDataset,
  dateBucket,
  formatNumber,
  numeric,
} from "@/lib/data-engine";
import {
  periodDefaults,
  collapseWaterfall,
  ratioMetric,
  type ComparisonInput,
  type PeriodComparison,
  type Fact,
} from "@/lib/diagnostics";
import { backgroundTask } from "@/lib/background";
import { EvidenceGuide } from "./evidence-guide";
function Waterfall({
  result,
  onGroup,
}: {
  result: PeriodComparison;
  onGroup: (name: string) => void;
}) {
  let cursor = result.previous;
  const bars = [{ name: "基期", from: 0, to: cursor, total: true }];
  for (const group of collapseWaterfall(result.groups)) {
    const from = cursor;
    cursor += group.delta;
    bars.push({ name: group.name, from, to: cursor, total: false });
  }
  bars.push({ name: "本期", from: 0, to: result.current, total: true });
  const values = bars.flatMap((b) => [b.from, b.to]),
    lo = Math.min(0, ...values),
    hi = Math.max(1, ...values),
    height = 190,
    y = (v: number) => 25 + ((hi - v) / (hi - lo || 1)) * height,
    w = 680 / bars.length;
  return (
    <div className="waterfall-wrap">
      <svg
        viewBox="0 0 740 275"
        role="img"
        aria-label="变化贡献瀑布图，基期加全部分组差额等于本期"
      >
        <line x1="32" x2="725" y1={y(0)} y2={y(0)} stroke="#cad8ce" />
        {bars.map((b, i) => (
          <g key={i}>
            <rect
              x={40 + i * w}
              width={Math.max(8, w - 12)}
              y={Math.min(y(b.from), y(b.to))}
              height={Math.max(2, Math.abs(y(b.to) - y(b.from)))}
              rx="3"
              fill={
                b.total ? "#0c806a" : b.to >= b.from ? "#7eaf96" : "#d29668"
              }
            />
            <text
              x={40 + i * w + (w - 12) / 2}
              y={Math.min(y(b.from), y(b.to)) - 8}
              textAnchor="middle"
              fontSize="10"
              fill="#456151"
            >
              {formatNumber(b.total ? b.to : b.to - b.from, true)}
            </text>
            <text
              x={40 + i * w + (w - 12) / 2}
              y="245"
              textAnchor="middle"
              fontSize="11"
              fill="#5d7467"
            >
              {b.name.length > 7 ? b.name.slice(0, 6) + "…" : b.name}
            </text>
          </g>
        ))}
      </svg>
      <p>基期 → 各分组增减 → 本期。超过八组时合并其余组，保留完整差额。</p>
      <div className="contribution-chips">
        {result.groups.slice(0, 5).map((g) => (
          <button
            className="button subtle"
            key={g.name}
            onClick={() => onGroup(g.name)}
          >
            {g.name} <ArrowRight size={12} />
          </button>
        ))}
      </div>
    </div>
  );
}
export function Diagnostics({
  dataset,
  profile,
  filters,
  onInspect,
  onExport,
}: {
  dataset: Dataset;
  profile: Profile;
  filters: FilterClause[];
  onInspect: (dataset: Dataset, title: string) => void;
  onExport: (name: string, text: string) => void;
}) {
  const dates = profile.fields.filter((f) => f.type === "date"),
    metrics = profile.fields.filter((f) => f.type === "number"),
    dimensions = profile.fields.filter((f) => f.type === "text");
  const [date, setDate] = useState(dates[0]?.name || ""),
    [metric, setMetric] = useState(
      metrics.find((f) => /销售额|收入|消费金额|sales/i.test(f.name))?.name ||
        metrics[0]?.name ||
        "",
    ),
    [dimension, setDimension] = useState(
      dimensions.find((f) => f.unique < 100)?.name || dimensions[0]?.name || "",
    );
  const [periods, setPeriods] = useState(() =>
    periodDefaults(dataset, dates[0]?.name || ""),
  );
  const [result, setResult] = useState<PeriodComparison | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [top, setTop] = useState(
      metrics.find((f) => /利润/.test(f.name))?.name || metrics[0]?.name || "",
    ),
    [bottom, setBottom] = useState(
      metrics.find((f) => /销售额|收入|消费金额/.test(f.name))?.name ||
        metrics[1]?.name ||
        metrics[0]?.name ||
        "",
    ),
    [ratioKind, setRatioKind] = useState<"ratio" | "distinct">("ratio"),
    [percent, setPercent] = useState(true);
  const input: ComparisonInput = {
    date,
    metric,
    dimension,
    ...periods,
    filters,
  };
  const key = JSON.stringify(input);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    if (!date || !metric || !dimension) return;
    setBusy(true);
    backgroundTask<PeriodComparison>(
      "comparison",
      { dataset, profile, input },
      controller.signal,
    )
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [key, dataset, profile]);
  const scope = useMemo(
    () => filterDataset(dataset, filters, profile),
    [dataset, filters, profile],
  );
  const ratio = useMemo(() => {
    try {
      return ratioMetric(scope, top, bottom, ratioKind);
    } catch {
      return null;
    }
  }, [scope, top, bottom, ratioKind]);
  function inspect(period: "current" | "previous" | "both", group?: string) {
    const selected = scope.rows.filter((row) => {
      const day = dateBucket(String(row[date] ?? ""), "day");
      return (
        (period === "both"
          ? (day >= periods.current.start && day <= periods.current.end) ||
            (day >= periods.previous.start && day <= periods.previous.end)
          : day >= periods[period].start && day <= periods[period].end) &&
        (!group || String(row[dimension] ?? "未填写") === group)
      );
    });
    onInspect(
      { ...dataset, rows: selected },
      (group ? group + " · " : "") +
        (period === "current"
          ? "本期"
          : period === "previous"
            ? "基期"
            : "两个周期") +
        "来源记录",
    );
  }
  function factSource(f: Fact) {
    inspect(
      f.id === "current"
        ? "current"
        : f.id === "previous"
          ? "previous"
          : "both",
      f.group,
    );
  }
  function exportComparison() {
    if (!result) return;
    onExport(
      "DataPilot_周期诊断.md",
      "# 周期诊断\n\n指标：" +
        metric +
        "；分解：" +
        dimension +
        "\n本期：" +
        periods.current.start +
        " 至 " +
        periods.current.end +
        "\n基期：" +
        periods.previous.start +
        " 至 " +
        periods.previous.end +
        "\n\n" +
        result.facts
          .map(
            (f) =>
              "- [" +
              f.id +
              "] " +
              f.title +
              "：" +
              (f.value === null ? "不适用" : f.value) +
              f.unit +
              "；" +
              f.detail,
          )
          .join("\n") +
        "\n\n|分组|基期|本期|差额|\n|---|---:|---:|---:|\n" +
        result.groups
          .map(
            (g) =>
              "|" +
              g.name.replace(/\|/g, "/").replace(/[\r\n]/g, " ") +
              "|" +
              g.previous +
              "|" +
              g.current +
              "|" +
              g.delta +
              "|",
          )
          .join("\n") +
        "\n\n## 范围\n" +
        JSON.stringify(filters) +
        "\n\n## 需核查\n" +
        result.warnings.join("\n") +
        "\n\n分组差额解释变化构成，不能据此确定业务因果。",
    );
  }
  return (
    <div className="diagnostic-stack">
      <section className="diagnostic-panel">
        <div className="diagnostic-heading">
          <div>
            <span className="eyebrow">BUSINESS DIAGNOSTICS</span>
            <h2>变化来自哪里？</h2>
            <p>比较周期，分解贡献，再回到记录核验。当前全局筛选同步生效。</p>
          </div>
          <CalendarDays size={25} />
        </div>
        {!dates.length || !metrics.length || !dimensions.length ? (
          <p className="diagnostic-warning">
            周期诊断需要日期字段、数值指标与文本分组字段。请导入含这些字段的数据，或打开场景模板。
          </p>
        ) : (
          <>
            <div className="diagnostic-controls">
              <label>
                日期字段
                <select
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPeriods(periodDefaults(dataset, e.target.value));
                  }}
                >
                  {dates.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label>
                合计指标
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                >
                  {metrics.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label>
                贡献分解
                <select
                  value={dimension}
                  onChange={(e) => setDimension(e.target.value)}
                >
                  {dimensions.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="period-presets">
              <button
                className="button subtle"
                onClick={() => setPeriods(periodDefaults(dataset, date))}
              >
                最新月份 / 上月
              </button>
              <button
                className="button subtle"
                onClick={() => setPeriods(periodDefaults(dataset, date, true))}
              >
                最新月份 / 上年同期
              </button>
              <span>锚定数据最新日期，可自行修改两个周期。</span>
            </div>
            <div className="period-grid">
              {(["current", "previous"] as const).map((key) => (
                <fieldset key={key}>
                  <legend>{key === "current" ? "本期" : "基期"}</legend>
                  <label>
                    开始
                    <input
                      aria-label={
                        (key === "current" ? "本期" : "基期") + "开始日期"
                      }
                      type="date"
                      value={periods[key].start}
                      onChange={(e) =>
                        setPeriods({
                          ...periods,
                          [key]: { ...periods[key], start: e.target.value },
                        })
                      }
                    />
                  </label>
                  <span>至</span>
                  <label>
                    结束
                    <input
                      aria-label={
                        (key === "current" ? "本期" : "基期") + "结束日期"
                      }
                      type="date"
                      value={periods[key].end}
                      onChange={(e) =>
                        setPeriods({
                          ...periods,
                          [key]: { ...periods[key], end: e.target.value },
                        })
                      }
                    />
                  </label>
                </fieldset>
              ))}
            </div>
            {busy && (
              <p role="status">
                <LoaderCircle size={16} className="spin" />{" "}
                后台计算全部分组的变化…
              </p>
            )}
            {error && (
              <p role="alert" className="diagnostic-warning">
                {error}
              </p>
            )}
            {result && (
              <>
                <div className="comparison-kpis">
                  {[
                    { label: "基期合计", value: formatNumber(result.previous) },
                    { label: "本期合计", value: formatNumber(result.current) },
                    {
                      label: "变化金额",
                      value:
                        (result.delta > 0 ? "+" : "") +
                        formatNumber(result.delta),
                    },
                    {
                      label: "增长率",
                      value:
                        result.growth === null
                          ? "不适用"
                          : (result.growth > 0 ? "+" : "") +
                            formatNumber(result.growth * 100) +
                            "%",
                    },
                  ].map((k) => (
                    <div key={k.label}>
                      <small>{k.label}</small>
                      <strong>{k.value}</strong>
                    </div>
                  ))}
                </div>
                {result.warnings.length > 0 && (
                  <details className="diagnostic-warning" open>
                    <summary>
                      核对覆盖与口径（{result.warnings.length}）
                    </summary>
                    {result.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </details>
                )}
                <Waterfall
                  result={result}
                  onGroup={(name) => inspect("both", name)}
                />
                <div className="diagnostic-heading">
                  <h3>全部分组贡献 · {result.groups.length} 组</h3>
                  <button className="text-button" onClick={exportComparison}>
                    <ArrowDownToLine size={14} />
                    导出完整诊断
                  </button>
                </div>
                <div className="diagnostic-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{dimension}</th>
                        <th>基期</th>
                        <th>本期</th>
                        <th>增减贡献</th>
                        <th>来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.groups.slice(0, 100).map((g) => (
                        <tr key={g.name}>
                          <td>{g.name}</td>
                          <td>{formatNumber(g.previous)}</td>
                          <td>{formatNumber(g.current)}</td>
                          <td className={g.delta < 0 ? "decline" : "increase"}>
                            {g.delta > 0 ? "+" : ""}
                            {formatNumber(g.delta)}
                          </td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => inspect("previous", g.name)}
                            >
                              基期
                            </button>{" "}
                            /{" "}
                            <button
                              className="text-button"
                              onClick={() => inspect("current", g.name)}
                            >
                              本期
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <small>
                  表格最多预览100组，导出包含全部分组；无效指标排除{" "}
                  {result.excluded} 条。贡献按完整数据计算。
                </small>
                <EvidenceGuide facts={result.facts} onSource={factSource} />
              </>
            )}
          </>
        )}
      </section>
      <section className="diagnostic-panel">
        <div className="diagnostic-heading">
          <div>
            <span className="eyebrow">METRIC DEFINITION</span>
            <h3>业务指标计算器</h3>
            <p>基于当前筛选范围，先确认公式与完整记录口径。</p>
          </div>
        </div>
        <div className="diagnostic-controls">
          <label>
            计算方式
            <select
              value={ratioKind}
              onChange={(e) => {
                setRatioKind(e.target.value as "ratio" | "distinct");
                setBottom("");
                setPercent(e.target.value === "ratio");
              }}
            >
              <option value="ratio">分子合计 / 分母合计</option>
              <option value="distinct">金额合计 / 去重标识数</option>
            </select>
          </label>
          <label>
            分子
            <select value={top} onChange={(e) => setTop(e.target.value)}>
              {metrics.map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </select>
          </label>
          <label>
            {ratioKind === "ratio" ? "分母" : "订单标识字段"}
            <select value={bottom} onChange={(e) => setBottom(e.target.value)}>
              <option value="">请选择字段</option>
              {(ratioKind === "ratio"
                ? metrics
                : profile.fields.filter((f) =>
                    /订单|order|编号|标识/i.test(f.name),
                  )
              ).map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="diagnostic-check">
          <input
            type="checkbox"
            checked={percent}
            onChange={(e) => setPercent(e.target.checked)}
          />
          以百分比显示
        </label>
        <div className="ratio-result">
          <strong>
            {ratio?.value === null || !ratio
              ? "不适用"
              : formatNumber(ratio.value * (percent ? 100 : 1)) +
                (percent ? "%" : "")}
          </strong>
          <span>
            {top || "分子"}合计 ÷{" "}
            {ratioKind === "ratio"
              ? (bottom || "分母") + "合计"
              : (bottom || "订单标识") + "去重数"}
          </span>
        </div>
        {ratio ? (
          <p>
            分子 {formatNumber(ratio.numerator)} / 分母{" "}
            {formatNumber(ratio.denominator)}；参与 {ratio.valid} 条，排除{" "}
            {ratio.excluded} 条不完整记录。
            {ratio.value === null ? "分母为零或没有有效记录，结果不适用。" : ""}
          </p>
        ) : (
          <p>请选择数据中存在的字段；客单价需要真实的订单标识。</p>
        )}
        <p className="diagnostic-note">
          利润率应选择利润 / 销售额；订单客单价选择销售额 /
          订单标识去重数。使用成对完整记录，不将逐行比率的平均值当作总体比率。
        </p>
      </section>
    </div>
  );
}
