"use client";
import { useId, useState } from "react";
import { ArrowUpRight, ArrowRight, Check, ChevronLeft, ChevronRight, GitCompareArrows, Minus, TrendingDown, TrendingUp, Waves } from "lucide-react";
import { formatNumber } from "@/lib/data-engine";
import { type PeriodComparison, type Period } from "@/lib/diagnostics";
import { contributionBalance, diagnosticDomain, diagnosticTicks, orderedDiagnosticGroups, waterfallSteps } from "@/lib/diagnostic-presentation";

type Props = { result: PeriodComparison; metric: string; dimension: string; unit?: string; current: Period; previous: Period; onInspect: (period: "previous" | "current" | "both", group?: string) => void };
const signed = (value: number, compact = false) => (value > 0 ? "+" : "") + formatNumber(value, compact);
const tone = (value: number) => value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
const color = (value: number) => value > 0 ? "#168875" : value < 0 ? "#ce8854" : "#8b9b96";
const shortName = (name: string, limit = 8) => name.length > limit ? name.slice(0, limit - 1) + "…" : name;

export function DiagnosticSummary({ result, metric, unit = "", current, previous }: Props) {
  const Icon = result.delta < 0 ? TrendingDown : result.delta > 0 ? TrendingUp : Minus;
  return <div className="comparison-kpis diagnostic-summary">
    <div className="diagnostic-kpi baseline"><span><i /><small>基期合计</small><GitCompareArrows size={17} /></span><strong title={formatNumber(result.previous)}>{formatNumber(result.previous, true)}<em>{unit}</em></strong><p>{previous.start} 至 {previous.end}</p><footer>{result.previousRows.toLocaleString()} 条有效记录</footer></div>
    <div className="diagnostic-kpi current"><span><i /><small>本期合计</small><Waves size={17} /></span><strong title={formatNumber(result.current)}>{formatNumber(result.current, true)}<em>{unit}</em></strong><p>{current.start} 至 {current.end}</p><footer>{result.currentRows.toLocaleString()} 条有效记录</footer></div>
    <div className={`diagnostic-kpi change ${tone(result.delta)}`}><span><small>合计变化</small><Icon size={19} /></span><strong title={signed(result.delta)}>{signed(result.delta, true)}<em>{unit}</em></strong><p>本期合计 − 基期合计</p><footer>{metric} · 全部分组差额</footer></div>
    <div className={`diagnostic-kpi growth ${result.growth === null ? "neutral" : tone(result.delta)}`}><span><small>增长率</small><Icon size={19} /></span><strong>{result.growth === null ? "不适用" : signed(result.growth * 100)}{result.growth !== null && <em>%</em>}</strong><p>{result.growth === null ? "基期为零或负数" : "以基期合计为比较基准"}</p><footer>仅描述变化，不推断原因</footer></div>
  </div>;
}

export function DiagnosticCharts({ result, metric, dimension, unit = "", onInspect }: Props) {
  const uid = "diagnostic" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [view, setView] = useState<"waterfall" | "compare" | "rank">("waterfall");
  const [selected, setSelected] = useState("current"), [hovered, setHovered] = useState<string | null>(null);
  const [direction, setDirection] = useState<"all" | "increase" | "decrease">("all"), [page, setPage] = useState(0);
  const steps = waterfallSteps(result), balance = contributionBalance(result.groups);
  const ordered = orderedDiagnosticGroups(result.groups, view === "rank" ? direction : "all");
  const pages = Math.ceil(ordered.length / 8), slice = ordered.slice(page * 8, page * 8 + 8);
  const activeId = hovered || selected;
  const activeGroup = result.groups.find(g => `group:${g.name}` === activeId);
  const step = steps.find(s => s.id === activeId);
  const isPrevious = activeId === "previous", isCurrent = activeId === "current";
  const activeName = activeGroup?.name || step?.name || "本期";
  const activate = (id: string) => setSelected(id);
  const events = (id: string) => ({
    role: "button", tabIndex: 0, "aria-pressed": selected === id,
    onMouseEnter: () => setHovered(id), onMouseLeave: () => setHovered(null), onFocus: () => setHovered(id), onBlur: () => setHovered(null),
    onClick: () => activate(id), onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(id); } },
  });
  const switchView = (value: typeof view) => { setView(value); setPage(0); setDirection("all"); setHovered(null); setSelected(value === "waterfall" ? "current" : `group:${orderedDiagnosticGroups(result.groups, "all")[0]?.name ?? ""}`); };
  const changePage = (next: number) => { setPage(next); setHovered(null); setSelected(`group:${ordered[next * 8]?.name ?? ""}`); };
  const changeDirection = (next: typeof direction) => { setDirection(next); setPage(0); setHovered(null); setSelected(`group:${orderedDiagnosticGroups(result.groups, next)[0]?.name ?? ""}`); };
  const tabKeys = (event: React.KeyboardEvent<HTMLButtonElement>, value: typeof view) => {
    const views = ["waterfall", "compare", "rank"] as const, index = views.indexOf(value);
    const next = event.key === "ArrowRight" ? views[(index + 1) % 3] : event.key === "ArrowLeft" ? views[(index + 2) % 3] : event.key === "Home" ? views[0] : event.key === "End" ? views[2] : null;
    if (!next) return;
    event.preventDefault(); switchView(next);
    (event.currentTarget.parentElement?.querySelector(`[data-view="${next}"]`) as HTMLButtonElement | null)?.focus();
  };
  function waterfall() {
    const domain = diagnosticDomain(steps.flatMap(s => [s.from, s.to]));
    const y = (v: number) => 25 + (domain[1] - v) / (domain[1] - domain[0]) * 250;
    const width = 620 / steps.length, barWidth = Math.min(64, width - 14);
    return <svg viewBox="0 0 740 350" role="group" aria-label="交互变化瀑布图，基期加分组差额等于本期">
      <defs>{["previous", "current", "positive", "negative", "neutral"].map((name, i) => <linearGradient key={name} id={`${uid}-${name}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={["#83a6c3", "#168875", "#45a58e", "#ce8854", "#8b9b96"][i]} /><stop offset="1" stopColor={["#b1c7d8", "#50ac94", "#a9d6c6", "#e7bc96", "#c0cdc7"][i]} /></linearGradient>)}</defs>
      {diagnosticTicks(domain).map((v, i) => <g key={i}><line x1="76" x2="714" y1={y(v)} y2={y(v)} stroke="#e2ebe5" strokeDasharray="3 5" /><text x="65" y={y(v) + 5} textAnchor="end" fill="#6b8077" fontSize="14">{formatNumber(v, true)}</text></g>)}
      <line x1="76" x2="714" y1={y(0)} y2={y(0)} stroke="#9fb4aa" />
      {steps.map((s, index) => {
        const x = 85 + index * width + (width - barWidth) / 2, total = s.kind === "current" || s.kind === "previous";
        const fill = total ? s.kind : s.kind === "remainder" ? "neutral" : tone(s.value), active = activeId === s.id;
        return <g key={s.id} {...events(s.id)} aria-label={`选择${s.name}，${total ? "合计" : "差额"}${signed(s.value)}`}>
          <title>{s.name}：{formatNumber(s.value)}；点击查看周期数值</title>
          <rect className="diagnostic-hit" x={85 + index * width} y="10" width={width} height="311" rx="10" fill={active ? "#eaf3ee" : "transparent"} />
          {index < steps.length - 1 && <line x1={x + barWidth} x2={85 + (index + 1) * width + (width - barWidth) / 2} y1={y(s.to)} y2={y(s.to)} stroke="#91a99b" strokeDasharray="4 4" />}
          <rect className="diagnostic-bar" x={x} y={Math.min(y(s.from), y(s.to))} width={barWidth} height={Math.max(3, Math.abs(y(s.to) - y(s.from)))} rx="6" fill={`url(#${uid}-${fill})`} stroke={active ? "#355f4e" : "none"} strokeWidth="1.5" />
          <text x={x + barWidth / 2} y={Math.min(y(s.from), y(s.to)) - 11} textAnchor="middle" fontSize="14" fontWeight="600" fill={total ? "#375c51" : color(s.value)}>{total ? formatNumber(s.value, true) : signed(s.value, true)}</text>
          <text x={x + barWidth / 2} y="308" textAnchor="middle" fontSize="14" fill={active ? "#17674f" : "#657a70"}>{shortName(s.name, 6)}</text>
          {selected === s.id && <circle cx={x + barWidth / 2} cy="324" r="3" fill="#168875" />}
        </g>;
      })}
    </svg>;
  }
  function horizontal() {
    const rank = view === "rank";
    const values = slice.flatMap(g => rank ? [g.delta] : [g.previous, g.current]);
    const domain = diagnosticDomain(values), h = 66 + slice.length * 58;
    const x = (v: number) => 148 + (v - domain[0]) / (domain[1] - domain[0]) * 450;
    return <svg viewBox={`0 0 740 ${h}`} role="group" aria-label={rank ? "正负贡献排行图" : "基期本期哑铃对比图"}>
      {diagnosticTicks(domain).map((v, i) => <g key={i}><line x1={x(v)} x2={x(v)} y1="15" y2={h - 36} stroke="#e1eae4" strokeDasharray="3 5" /><text x={x(v)} y={h - 12} textAnchor="middle" fontSize="14" fill="#6b8077">{formatNumber(v, true)}</text></g>)}
      <line x1={x(0)} x2={x(0)} y1="15" y2={h - 36} stroke="#a2b5a9" />
      {slice.map((g, index) => {
        const id = `group:${g.name}`, active = id === activeId, y = 38 + index * 58;
        return <g key={g.name} {...events(id)} aria-label={`选择${g.name}，基期${formatNumber(g.previous)}，本期${formatNumber(g.current)}，差额${signed(g.delta)}`}>
          <title>{g.name}：基期 {formatNumber(g.previous)}，本期 {formatNumber(g.current)}，差额 {signed(g.delta)}</title>
          <rect className="diagnostic-hit" x="8" y={y - 24} width="724" height="50" rx="9" fill={active ? "#eaf3ee" : index % 2 ? "#f8faf8" : "transparent"} />
          <text x="130" y={y + 5} textAnchor="end" fill={active ? "#17674f" : "#536b5e"} fontSize="15">{shortName(g.name)}</text>
          {rank ? <><rect x={Math.min(x(0), x(g.delta))} y={y - 10} width={Math.max(3, Math.abs(x(g.delta) - x(0)))} height="20" rx="6" fill={color(g.delta)} opacity={active ? 1 : .74} /><circle cx={x(g.delta)} cy={y} r="4" fill="#fff" stroke={color(g.delta)} strokeWidth="2" /></> : <><line x1={x(g.previous)} x2={x(g.current)} y1={y} y2={y} stroke={color(g.delta)} strokeWidth={active ? 7 : 5} strokeLinecap="round" opacity=".5" /><circle cx={x(g.previous)} cy={y} r="6" fill="#fff" stroke="#789bb7" strokeWidth="3" /><circle cx={x(g.current)} cy={y} r="7" fill="#168875" stroke="#fff" strokeWidth="2" /></>}
          <text x="720" y={y + 5} textAnchor="end" fontSize="15" fontWeight="600" fill={color(g.delta)}>{signed(g.delta, true)}</text>
        </g>;
      })}
    </svg>;
  }
  return <section className="diagnostic-visuals" aria-label="周期诊断交互图表">
    <header className="diagnostic-viz-heading"><div><span className="diagnostic-viz-eyebrow">CHANGE EXPLORER</span><h3>把变化，一层层看清</h3><p>{metric}合计 <span>·</span> 按{dimension}分解{unit && <><span>·</span>单位：{unit}</>}</p></div>
      <div className="diagnostic-view-tabs" role="tablist" aria-label="诊断图表视角">{([ ["waterfall", "变化瀑布", Waves], ["compare", "周期对比", GitCompareArrows], ["rank", "贡献排行", TrendingUp] ] as const).map(([value, title, Icon]) => <button key={value} data-view={value} id={`${uid}-${value}-tab`} role="tab" tabIndex={view === value ? 0 : -1} aria-selected={view === value} aria-controls={`${uid}-panel`} onKeyDown={e => tabKeys(e, value)} onClick={() => switchView(value)}><Icon size={16} />{title}</button>)}</div>
    </header>
    <div className="diagnostic-balance"><div><i className="positive" /><span>增加合计</span><strong>{signed(balance.increase, true)}</strong></div><div><i className="negative" /><span>减少合计</span><strong>{signed(balance.decrease, true)}</strong></div><span className="diagnostic-balance-net">净变化 <b className={tone(result.delta)}>{signed(result.delta, true)}</b></span></div>
    <div className="diagnostic-chart-meta"><div className="diagnostic-chart-legend">{view === "compare" ? <><span><i className="baseline" />基期</span><span><i className="current" />本期</span><span className="diagnostic-legend-hint">连线表示变化方向</span></> : <><span><i className="positive" />增加</span><span><i className="negative" />减少</span><span><i className="neutral" />无变化{view === "waterfall" ? " / 合并组" : ""}</span></>}</div>
      {view === "rank" && balance.increase > 0 && balance.decrease < 0 && <select aria-label="贡献方向" value={direction} onChange={e => changeDirection(e.target.value as typeof direction)}><option value="all">全部增减</option><option value="increase">只看增加</option><option value="decrease">只看减少</option></select>}
    </div>
    <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${view}-tab`} className="diagnostic-plot-scroll"><div className="diagnostic-plot">{!result.groups.length ? <p className="diagnostic-plot-empty">两个周期没有可展示的有效分组，请调整日期或指标。</p> : view === "waterfall" ? waterfall() : horizontal()}</div></div>
    <div className="diagnostic-chart-caption"><span>{view === "waterfall" ? "基期 + 全部分组差额 = 本期；超过 8 组时合并其余分组。" : "按差额绝对值排序，右侧为本期减基期。"} <span className="diagnostic-scroll-hint">可横向滑动查看完整图表。</span></span>{view !== "waterfall" && pages > 1 && <nav aria-label="图表分组翻页"><button aria-label="上一页分组" disabled={page === 0} onClick={() => changePage(page - 1)}><ChevronLeft size={16} /></button><span>{page + 1} / {pages}</span><button aria-label="下一页分组" disabled={page + 1 >= pages} onClick={() => changePage(page + 1)}><ChevronRight size={16} /></button></nav>}</div>
    <div className={`diagnostic-selection ${activeGroup ? tone(activeGroup.delta) : "neutral"}`} aria-live="polite"><div className="diagnostic-selected-title"><span><Check size={14} />当前选中</span><strong>{activeName}</strong><small>{activeGroup ? "分组差额，业务原因需核验" : step?.kind === "remainder" ? `合并 ${step.combined} 组；完整分组见下方表格` : "周期合计，点击图形可切换"}</small></div>
      {activeGroup ? <><dl><div><dt>基期</dt><dd>{formatNumber(activeGroup.previous)}<small>{unit}</small></dd></div><ArrowRight size={16} /><div><dt>本期</dt><dd>{formatNumber(activeGroup.current)}<small>{unit}</small></dd></div><div><dt>增减贡献</dt><dd className={tone(activeGroup.delta)}>{signed(activeGroup.delta)}<small>{unit}</small></dd></div></dl><div className="diagnostic-source-actions"><button onClick={() => onInspect("previous", activeGroup.name)}>基期来源 <ArrowUpRight size={14} /></button><button onClick={() => onInspect("current", activeGroup.name)}>本期来源 <ArrowUpRight size={14} /></button></div></> : <><dl><div><dt>{step?.kind === "remainder" ? "合并差额" : "有效合计"}</dt><dd>{formatNumber(step?.value ?? result.current)}<small>{unit}</small></dd></div>{(isPrevious || isCurrent) && <div><dt>有效记录</dt><dd>{(isPrevious ? result.previousRows : result.currentRows).toLocaleString()}<small>条</small></dd></div>}</dl>{(isPrevious || isCurrent) && <div className="diagnostic-source-actions"><button onClick={() => onInspect(isPrevious ? "previous" : "current")}>核对{isPrevious ? "基期" : "本期"}来源 <ArrowUpRight size={14} /></button></div>}</>}
    </div>
    <p className="diagnostic-viz-note">悬停预览，点击或按回车选中分组，再核对来源。颜色只区分数值增减，不代表业务好坏。</p>
  </section>;
}
