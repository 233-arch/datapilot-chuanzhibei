"use client";
import { useMemo, useState, useEffect } from "react";
import {
  FlaskConical,
  ScanSearch,
  SlidersHorizontal,
  Bookmark,
  ArrowRight,
  ArrowUpRight,
  Download,
  RotateCcw,
  Trash2,
  GitCompareArrows,
  CheckCircle2,
  Info,
  AlertTriangle,
  Search,
  Plus,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  type Dataset,
  type Profile,
  type Plan,
  type FilterClause,
  formatNumber,
  executePlan,
  reportMarkdown,
  filtersForPlan,
} from "@/lib/data-engine";
import {
  type PinnedInsight,
  detectAnomalies,
  simulateScenario,
  compareInsights,
  insightSummary,
} from "@/lib/exploration";
type LabTab = "anomalies" | "scenario" | "notebook";
export function ExplorationLab({
  dataset,
  sourceDataset,
  profile,
  plan,
  pins,
  onPinsChange,
  onOpenPlan,
  onInspectRow,
  onPinCurrent,
  onExport,
}: {
  dataset: Dataset;
  sourceDataset: Dataset;
  profile: Profile;
  plan: Plan;
  pins: PinnedInsight[];
  onPinsChange: (pins: PinnedInsight[]) => void;
  onOpenPlan: (plan: Plan) => void;
  onInspectRow: (index: number) => void;
  onPinCurrent: () => void;
  onExport: (name: string, text: string) => void;
}) {
  const [tab, setTab] = useState<LabTab>("anomalies");
  return (
    <section className="exploration-lab">
      <div className="lab-intro">
        <span className="lab-intro-icon">
          <FlaskConical size={23} />
        </span>
        <div>
          <span className="eyebrow">EXPLORATION LAB</span>
          <h2>让每一次发现，都经得起追问。</h2>
          <p>从异常线索到假设验证，把直觉变成可检查的分析。</p>
        </div>
        <span className="badge green">基于真实计算</span>
      </div>
      <div
        className="lab-navigation"
        role="tablist"
        aria-label="创新实验室工具"
      >
        {(
          [
            { id: "anomalies", label: "异常侦探", icon: ScanSearch },
            { id: "scenario", label: "情景推演", icon: SlidersHorizontal },
            {
              id: "notebook",
              label: `洞察收藏${pins.length ? ` · ${pins.length}` : ""}`,
              icon: Bookmark,
            },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>
      {tab === "anomalies" && (
        <AnomalyInspector
          dataset={dataset}
          profile={profile}
          onInspectRow={onInspectRow}
        />
      )}
      {tab === "scenario" && (
        <ScenarioStudio
          dataset={dataset}
          profile={profile}
          plan={plan}
          onExport={onExport}
        />
      )}
      {tab === "notebook" && (
        <InsightNotebook
          dataset={sourceDataset}
          profile={profile}
          pins={pins}
          onPinsChange={onPinsChange}
          onOpenPlan={onOpenPlan}
          onPinCurrent={onPinCurrent}
          onExport={onExport}
        />
      )}
    </section>
  );
}
function AnomalyInspector({
  dataset,
  profile,
  onInspectRow,
}: {
  dataset: Dataset;
  profile: Profile;
  onInspectRow: (index: number) => void;
}) {
  const metrics = profile.fields.filter((f) => f.type === "number");
  const [metric, setMetric] = useState(metrics[0]?.name || ""),
    [factor, setFactor] = useState(1.5);
  useEffect(() => {
    if (!metrics.some((f) => f.name === metric))
      setMetric(metrics[0]?.name || "");
  }, [dataset.id, metric, metrics]);
  const result = useMemo(
    () => (metric ? detectAnomalies(dataset, metric, factor) : null),
    [dataset, metric, factor],
  );
  if (!result)
    return (
      <div className="empty-state chart-card">
        <ScanSearch size={36} />
        <h2>先导入包含数值字段的数据</h2>
        <p>异常检测需要至少一个数值指标。</p>
      </div>
    );
  return (
    <div className="lab-card">
      <div className="lab-card-heading">
        <div>
          <h3>找到异常，也解释为什么。</h3>
          <p>用四分位距 IQR 标记统计异常，保留原始记录供人工核对。</p>
        </div>
        <span className="method-tag">IQR · 可解释</span>
      </div>
      <div className="lab-controls">
        <label>
          检测指标
          <select
            aria-label="异常检测指标"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {metrics.map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
          </select>
        </label>
        <label className="range-control">
          阈值灵敏度 <strong>{factor.toFixed(1)} × IQR</strong>
          <input
            aria-label="异常检测阈值"
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={factor}
            onChange={(e) => setFactor(Number(e.target.value))}
          />
          <span>
            <small>更敏感</small>
            <small>更宽松</small>
          </span>
        </label>
      </div>
      <div className="lab-stats">
        <div>
          <span>有效记录</span>
          <strong>{result.valid.toLocaleString()}</strong>
        </div>
        <div>
          <span>标记异常</span>
          <strong className={result.anomalies.length ? "amber-text" : ""}>
            {result.anomalies.length}
          </strong>
        </div>
        <div>
          <span>中位数</span>
          <strong>{formatNumber(result.median)}</strong>
        </div>
        <div>
          <span>缺失 / 无效</span>
          <strong>{result.excluded}</strong>
        </div>
      </div>
      <div className="fence-diagram">
        <div>
          <span>下界</span>
          <strong>{formatNumber(result.lower)}</strong>
        </div>
        <div className="fence-band">
          <span>Q1 {formatNumber(result.q1)}</span>
          <i />
          <span>Q3 {formatNumber(result.q3)}</span>
        </div>
        <div>
          <span>上界</span>
          <strong>{formatNumber(result.upper)}</strong>
        </div>
      </div>
      <div className="lab-explanation">
        <Info size={15} />
        <p>
          下界 = Q1 − {factor.toFixed(1)} × IQR，上界 = Q3 + {factor.toFixed(1)}{" "}
          ×
          IQR。异常是统计线索，不等于错误数据；不会自动删除。当前使用筛选后的记录。
          {result.iqr === 0 ? "当前四分位距为 0，请谨慎解释标记。" : ""}
        </p>
      </div>
      {result.insufficient ? (
        <div className="lab-empty">
          <Info size={25} />
          <strong>有效数值不足 4 条，暂不判断异常</strong>
        </div>
      ) : result.anomalies.length ? (
        <>
          <div className="lab-table-title">
            <h4>异常线索</h4>
            <span>按与中位数的距离排序 · 显示前 12 条</span>
          </div>
          <div className="table-overflow">
            <table className="data-table">
              <thead>
                <tr>
                  <th>筛选内序号</th>
                  <th>{metric}</th>
                  <th>标记原因</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.anomalies.slice(0, 12).map((item) => (
                  <tr key={item.index}>
                    <td>#{item.index + 1}</td>
                    <td>
                      <strong>{formatNumber(item.value)}</strong>
                    </td>
                    <td>
                      <span className="outlier-tag">
                        {item.direction} ·{" "}
                        {item.direction === "偏高" ? "超过上界" : "低于下界"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onInspectRow(item.index)}
                      >
                        查看来源 <ArrowUpRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="lab-empty">
          <CheckCircle2 size={28} />
          <strong>当前阈值下，没有超出边界的记录</strong>
          <p>可以降低阈值观察分布变化，但不要为获得异常而调整结论。</p>
        </div>
      )}
    </div>
  );
}
function ScenarioStudio({
  dataset,
  profile,
  plan,
  onExport,
}: {
  dataset: Dataset;
  profile: Profile;
  plan: Plan;
  onExport: (name: string, text: string) => void;
}) {
  const metrics = profile.fields.filter((f) => f.type === "number"),
    dimensions = profile.fields.filter(
      (f) => f.type === "text" && f.unique < 80,
    );
  const [metric, setMetric] = useState(metrics[0]?.name || ""),
    [percent, setPercent] = useState(10),
    [dimension, setDimension] = useState(dimensions[0]?.name || ""),
    [target, setTarget] = useState("");
  useEffect(() => {
    if (!metrics.some((f) => f.name === metric))
      setMetric(metrics[0]?.name || "");
    if (!dimensions.some((f) => f.name === dimension)) {
      setDimension(dimensions[0]?.name || "");
      setTarget("");
    }
  }, [dataset.id, metric, dimension, metrics, dimensions]);
  const options = [
    ...new Set(
      dataset.rows
        .map((r) => r[dimension])
        .filter((v) => v !== null)
        .map(String),
    ),
  ].sort();
  const condition: FilterClause | undefined = target
    ? { field: dimension, operator: "eq", value: target }
    : undefined;
  const result = useMemo(
    () =>
      metric ? simulateScenario(dataset, metric, percent, condition) : null,
    [dataset, metric, percent, dimension, target],
  );
  const comparison = useMemo(() => {
    if (!result) return [];
    const p = {
      ...plan,
      metric,
      aggregate: "sum" as const,
      sort: "natural" as const,
      filters: undefined,
      filter: undefined,
    };
    const before = executePlan(dataset, profile, p),
      after = executePlan(result.dataset, profile, p);
    return before.points.map((point) => ({
      name: point.name,
      baseline: point.value,
      simulated: after.points.find((p) => p.name === point.name)?.value ?? 0,
    }));
  }, [result, dataset, profile, plan, metric]);
  if (!result)
    return (
      <div className="empty-state chart-card">
        <SlidersHorizontal size={35} />
        <h2>需要数值指标才能进行情景推演</h2>
      </div>
    );
  function exportScenario() {
    if (!result) return;
    onExport(
      "情景推演说明.md",
      `# 情景模拟，不是预测\n\n指标：${metric}\n作用范围：${target ? dimension + "=" + target : "当前全部记录"}\n调整：${percent}%\n原始记录未修改。只改变符合条件记录的单项数值，其他条件保持不变。\n\n- 基线合计：${result.baseline}\n- 模拟合计：${result.simulated}\n- 变化量：${result.delta}\n- 影响记录：${result.affected}\n- 有效记录：${result.valid}\n\n计算公式：模拟合计 = 基线合计 + 目标记录指标合计 × 调整率。不存在因果或未来收益保证。`,
    );
  }
  return (
    <div className="lab-card">
      <div className="lab-card-heading">
        <div>
          <h3>如果改变一个条件，会怎样？</h3>
          <p>固定当前样本，对单项指标做比例调整，比较确定性的算术结果。</p>
        </div>
        <span className="method-tag amber">情景模拟 · 非预测</span>
      </div>
      <div className="scenario-control-grid">
        <label>
          调整指标
          <select
            aria-label="模拟指标"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {metrics.map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
          </select>
        </label>
        <label>
          范围字段
          <select
            aria-label="模拟范围字段"
            value={dimension}
            onChange={(e) => {
              setDimension(e.target.value);
              setTarget("");
            }}
          >
            {dimensions.length ? (
              dimensions.map((f) => <option key={f.name}>{f.name}</option>)
            ) : (
              <option value="">全部记录</option>
            )}
          </select>
        </label>
        <label>
          作用范围
          <select
            aria-label="模拟作用范围"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">当前全部记录</option>
            {target && !options.includes(target) && (
              <option value={target}>{target}（当前无匹配）</option>
            )}
            {options.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="scenario-slider">
        <div>
          <label htmlFor="scenario-percent">将{metric}调整</label>
          <strong className={percent < 0 ? "amber-text" : ""}>
            {percent > 0 ? "+" : ""}
            {percent}%
          </strong>
          <button className="text-button" onClick={() => setPercent(0)}>
            <RotateCcw size={12} />
            重置
          </button>
        </div>
        <input
          id="scenario-percent"
          aria-label="模拟调整比例"
          type="range"
          min="-50"
          max="50"
          step="1"
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
        />
        <div className="slider-ends">
          <span>−50%</span>
          <span>保持不变</span>
          <span>+50%</span>
        </div>
        <div className="scenario-presets">
          {[-10, 0, 10, 20].map((n) => (
            <button
              className={percent === n ? "selected" : ""}
              onClick={() => setPercent(n)}
              key={n}
            >
              {n > 0 ? "+" : ""}
              {n}%
            </button>
          ))}
        </div>
      </div>
      <div className="lab-stats scenario-stats">
        <div>
          <span>基线合计</span>
          <strong>{formatNumber(result.baseline, true)}</strong>
        </div>
        <div>
          <span>模拟合计</span>
          <strong>{formatNumber(result.simulated, true)}</strong>
        </div>
        <div>
          <span>变化量</span>
          <strong className={result.delta < 0 ? "amber-text" : "green-text"}>
            {result.delta > 0 ? "+" : ""}
            {formatNumber(result.delta, true)}
          </strong>
        </div>
        <div>
          <span>影响记录 / 有效记录</span>
          <strong>
            {result.affected.toLocaleString()}
            <small> / {result.valid.toLocaleString()}</small>
          </strong>
        </div>
      </div>
      <div
        className="scenario-chart"
        role="img"
        aria-label="基线与模拟值对比图"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 600, height: 230 }}
          minWidth={0}
        >
          <BarChart
            data={comparison}
            margin={{ top: 12, right: 15, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 5"
              vertical={false}
              stroke="#e8eee4"
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#829176" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatNumber(v, true)}
              tick={{ fontSize: 9, fill: "#829176" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              formatter={(v) => formatNumber(Number(v))}
              contentStyle={{
                fontSize: 11,
                borderRadius: 7,
                borderColor: "#e1eadb",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar
              dataKey="baseline"
              name="基线"
              fill="#c8d7bb"
              radius={[3, 3, 0, 0]}
              maxBarSize={32}
              isAnimationActive={false}
            />
            <Bar
              dataKey="simulated"
              name="模拟值"
              fill="#16866c"
              radius={[3, 3, 0, 0]}
              maxBarSize={32}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="lab-explanation">
        <AlertTriangle size={15} />
        <p>
          仅假设所选记录的{metric}
          按比例变化，统一使用“合计”口径。原始数据与其他字段保持不变，不推断因果，不代表未来结果。展示当前维度的前{" "}
          {plan.limit} 组。
        </p>
      </div>
      <button className="button subtle" onClick={exportScenario}>
        <Download size={13} />
        导出假设与计算说明
      </button>
    </div>
  );
}
function InsightNotebook({
  dataset,
  profile,
  pins,
  onPinsChange,
  onOpenPlan,
  onPinCurrent,
  onExport,
}: {
  dataset: Dataset;
  profile: Profile;
  pins: PinnedInsight[];
  onPinsChange: (pins: PinnedInsight[]) => void;
  onOpenPlan: (plan: Plan) => void;
  onPinCurrent: () => void;
  onExport: (name: string, text: string) => void;
}) {
  const [left, setLeft] = useState(pins[0]?.id || ""),
    [right, setRight] = useState(pins[1]?.id || ""),
    [removed, setRemoved] = useState<PinnedInsight | null>(null);
  useEffect(() => {
    if (!pins.some((p) => p.id === left)) setLeft(pins[0]?.id || "");
    if (!pins.some((p) => p.id === right))
      setRight(pins.find((p) => p.id !== left)?.id || "");
  }, [pins, left, right]);
  const a = pins.find((p) => p.id === left),
    b = pins.find((p) => p.id === right);
  const comparison = useMemo(
    () => (a && b ? compareInsights(dataset, profile, a, b) : null),
    [dataset, profile, a, b],
  );
  const [query, setQuery] = useState("");
  function exportNotebook() {
    const analyses = pins.map((pin) => ({
      plan: pin.plan,
      result: executePlan(dataset, profile, pin.plan),
    }));
    onExport(
      "洞察收藏报告.md",
      reportMarkdown(dataset, profile, analyses) +
        "\n## 分析批注\n\n" +
        pins
          .map((p) => `### ${p.name}\n\n${p.note || "未添加批注"}`)
          .join("\n\n"),
    );
  }
  return (
    <div className="notebook">
      <div className="notebook-toolbar">
        <div>
          <h3>把发现留下来，带着依据比较。</h3>
          <p>收藏保存分析口径，结果始终从当前原始数据重新计算。</p>
        </div>
        <button className="button primary" onClick={onPinCurrent}>
          <Plus size={13} />
          收藏当前分析
        </button>
      </div>
      {removed && (
        <div className="notebook-undo">
          已移除“{removed.name}”
          <button
            onClick={() => {
              if (pins.length < 12) onPinsChange([...pins, removed]);
              setRemoved(null);
            }}
          >
            撤销移除
          </button>
        </div>
      )}
      {!pins.length ? (
        <div className="empty-state chart-card">
          <Bookmark size={40} />
          <h2>值得保留的发现，在这里相遇。</h2>
          <p>先收藏一张图表，再改变筛选条件收藏第二张，即可对比同口径结果。</p>
        </div>
      ) : (
        <>
          <div className="notebook-search">
            <Search size={14} />
            <input
              aria-label="搜索收藏洞察"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索收藏名称或批注…"
            />
            <button className="text-button" onClick={exportNotebook}>
              <Download size={13} />
              导出收藏
            </button>
          </div>
          <div className="pin-grid">
            {pins
              .filter((p) =>
                (p.name + p.note).toLowerCase().includes(query.toLowerCase()),
              )
              .map((pin) => {
                const result = executePlan(dataset, profile, pin.plan);
                return (
                  <article className="pin-card" key={pin.id}>
                    <div className="pin-card-top">
                      <Bookmark size={15} />
                      <input
                        aria-label={`收藏名称 ${pin.id}`}
                        value={pin.name}
                        maxLength={80}
                        onChange={(e) =>
                          onPinsChange(
                            pins.map((p) =>
                              p.id === pin.id
                                ? { ...p, name: e.target.value }
                                : p,
                            ),
                          )
                        }
                      />
                      <button
                        className="icon-button"
                        aria-label={`移除收藏 ${pin.name}`}
                        onClick={() => {
                          setRemoved(pin);
                          onPinsChange(pins.filter((p) => p.id !== pin.id));
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="pin-meta">
                      {insightSummary(pin.plan, result)}
                    </p>
                    <p className="pin-summary">{result.summary}</p>
                    <textarea
                      aria-label={`洞察批注 ${pin.id}`}
                      placeholder="记录你的判断或业务背景…"
                      value={pin.note}
                      maxLength={500}
                      onChange={(e) =>
                        onPinsChange(
                          pins.map((p) =>
                            p.id === pin.id
                              ? { ...p, note: e.target.value }
                              : p,
                          ),
                        )
                      }
                    />
                    <div className="pin-footer">
                      <span>
                        {filtersForPlan(pin.plan)
                          .map((f) => `${f.field}: ${f.value || "为空"}`)
                          .join(" · ") || "全部记录"}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => onOpenPlan(pin.plan)}
                      >
                        恢复分析 <ArrowUpRight size={12} />
                      </button>
                    </div>
                  </article>
                );
              })}
          </div>
        </>
      )}
      {pins.length >= 2 && (
        <section className="lab-card compare-section">
          <div className="lab-card-heading">
            <div>
              <h3>
                <GitCompareArrows size={17} />
                同口径，才能真比较。
              </h3>
              <p>左右结果独立计算；不存在的分组显示为“无匹配”，不会冒充 0。</p>
            </div>
          </div>
          <div className="compare-selectors">
            <label>
              基线洞察
              <select
                aria-label="基线洞察"
                value={left}
                onChange={(e) => setLeft(e.target.value)}
              >
                {pins.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight size={18} />
            <label>
              对比洞察
              <select
                aria-label="对比洞察"
                value={right}
                onChange={(e) => setRight(e.target.value)}
              >
                {pins.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {left === right ? (
            <div className="lab-explanation">
              <Info size={15} />
              <p>请选择两项不同的洞察。</p>
            </div>
          ) : comparison && !comparison.compatible ? (
            <div className="lab-explanation">
              <Info size={15} />
              <p>{comparison.reason}</p>
            </div>
          ) : (
            comparison?.compatible && (
              <>
                <div className="table-overflow">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{a?.plan.groupBy}</th>
                        <th>基线值</th>
                        <th>对比值</th>
                        <th>对比 − 基线</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.points.map((p) => (
                        <tr key={p.name}>
                          <td>{p.name}</td>
                          <td>
                            {p.before === null
                              ? "无匹配"
                              : formatNumber(p.before)}
                          </td>
                          <td>
                            {p.after === null
                              ? "无匹配"
                              : formatNumber(p.after)}
                          </td>
                          <td
                            className={
                              p.delta !== null && p.delta < 0
                                ? "amber-text"
                                : "green-text"
                            }
                          >
                            {p.delta === null
                              ? "不可比"
                              : `${p.delta > 0 ? "+" : ""}${formatNumber(p.delta)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="compare-caption">
                  仅比较两项洞察各自展示的 Top N
                  分组，不推断统计显著性或因果关系。
                </p>
              </>
            )
          )}
        </section>
      )}
    </div>
  );
}
