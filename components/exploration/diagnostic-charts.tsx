"use client";
import { useId, useState } from "react";
import { ArrowUpRight, ArrowDownRight, ArrowDownUp, BarChart3, ChevronLeft, ChevronRight, GitCompareArrows, Minus, TrendingDown, TrendingUp, Waves } from "lucide-react";
import { formatNumber } from "@/lib/data-engine";
import { type PeriodComparison, type Period } from "@/lib/diagnostics";
import { contributionBalance, diagnosticDomain, orderedDiagnosticGroups, barGeometry, changeText } from "@/lib/diagnostic-presentation";

type Props = { result: PeriodComparison; metric: string; dimension: string; unit?: string; current: Period; previous: Period; onInspect: (period: "previous" | "current" | "both", group?: string) => void };
const signed = (value: number, compact = false) => (value > 0 ? "+" : "") + formatNumber(value, compact);
const tone = (value: number) => value > 0 ? "positive" : value < 0 ? "negative" : "neutral";

export function DiagnosticSummary({ result, metric, unit = "", current, previous }: Props) {
  const Icon = result.delta < 0 ? TrendingDown : result.delta > 0 ? TrendingUp : Minus;
  return <div className="comparison-kpis diagnostic-summary">
    <div className="diagnostic-kpi baseline"><span><i /><small>基期合计</small><GitCompareArrows size={17} /></span><strong title={formatNumber(result.previous)}>{formatNumber(result.previous, true)}<em>{unit}</em></strong><p>{previous.start} 至 {previous.end}</p><footer>{result.previousRows.toLocaleString()} 条有效记录</footer></div>
    <div className="diagnostic-kpi current"><span><i /><small>本期合计</small><Waves size={17} /></span><strong title={formatNumber(result.current)}>{formatNumber(result.current, true)}<em>{unit}</em></strong><p>{current.start} 至 {current.end}</p><footer>{result.currentRows.toLocaleString()} 条有效记录</footer></div>
    <div className={`diagnostic-kpi change ${tone(result.delta)}`}><span><small>合计变化</small><Icon size={19} /></span><strong title={signed(result.delta)}>{signed(result.delta, true)}<em>{unit}</em></strong><p>本期合计 − 基期合计</p><footer>{metric} · 全部分组差额</footer></div>
    <div className={`diagnostic-kpi growth ${result.growth === null ? "neutral" : tone(result.delta)}`}><span><small>增长率</small><Icon size={19} /></span><strong>{result.growth === null ? "不适用" : signed(result.growth * 100)}{result.growth !== null && <em>%</em>}</strong><p>{result.growth === null ? "基期为零或负数" : "以基期合计为比较基准"}</p><footer>仅描述变化，不推断原因</footer></div>
  </div>;
}

export function DiagnosticCharts({ result, metric, dimension, unit = "", current, previous, onInspect }: Props) {
  const uid = "diagnostic" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [view, setView] = useState<"compare" | "rank">("compare");
  const [selected, setSelected] = useState<string | null>(null);
  const [direction, setDirection] = useState<"all" | "increase" | "decrease">("all"), [page, setPage] = useState(0);
  const balance = contributionBalance(result.groups);
  const ordered = orderedDiagnosticGroups(result.groups, view === "rank" ? direction : "all");
  const pages = Math.ceil(ordered.length / 6), slice = ordered.slice(page * 6, page * 6 + 6);
  // One domain for every group and page; a short bar always means the same value.
  const domain = diagnosticDomain(result.groups.flatMap(g => view === "compare" ? [g.previous, g.current] : [g.delta]));
  const zero = barGeometry(0, domain).zero;
  const change = changeText(result.delta, unit);
  const switchView = (value: typeof view) => { setView(value); setPage(0); setDirection("all"); setSelected(null); };
  const changePage = (next: number) => { setPage(next); setSelected(null); };
  const tabKeys = (event: React.KeyboardEvent<HTMLButtonElement>, value: typeof view) => {
    const next = ["ArrowLeft", "ArrowRight"].includes(event.key) ? value === "compare" ? "rank" : "compare" : event.key === "Home" ? "compare" : event.key === "End" ? "rank" : null;
    if (!next) return;
    event.preventDefault(); switchView(next);
    (event.currentTarget.parentElement?.querySelector(`[data-view="${next}"]`) as HTMLButtonElement | null)?.focus();
  };
  function track(value: number, kind: "previous" | "current" | "change") {
    const geometry = barGeometry(value, domain);
    return <span className="diagnostic-pair-track" aria-hidden="true"><i className="diagnostic-zero" style={{ left: `${geometry.zero}%` }} />
      <i className={`diagnostic-pair-bar ${kind === "change" ? tone(value) : kind}`} style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }} /></span>;
  }
  return <section className="diagnostic-visuals diagnostic-simple" aria-label="周期诊断交互图表">
    <header className="diagnostic-viz-heading"><div><h3>哪些分组变多了，哪些变少了？</h3><p>{metric}合计 <span>·</span> 按{dimension}比较{unit && <><span>·</span>单位：{unit}</>}</p></div>
      <div className="diagnostic-view-tabs" role="tablist" aria-label="诊断图表视角">{([["compare", "两期对比", BarChart3], ["rank", "增减排行", ArrowDownUp]] as const).map(([value, title, Icon]) => <button key={value} data-view={value} id={`${uid}-${value}-tab`} role="tab" tabIndex={view === value ? 0 : -1} aria-selected={view === value} aria-controls={`${uid}-panel`} onKeyDown={e => tabKeys(e, value)} onClick={() => switchView(value)}><Icon size={16} />{title}</button>)}</div>
    </header>
    <div className="diagnostic-plain-summary"><div><span>整体变化</span><strong className={tone(result.delta)}>{change}</strong></div><p>{!result.previousRows || !result.currentRows ? "至少一个周期没有有效记录，请先核对日期和数据覆盖。" : <>本期合计 <b>{formatNumber(result.current)}{unit}</b>，基期合计 <b>{formatNumber(result.previous)}{unit}</b>。{result.growth !== null && result.delta !== 0 && <>相较基期{result.delta > 0 ? "增加" : "减少"} {formatNumber(Math.abs(result.growth) * 100)}%。</>}</>}</p></div>
    <div className="diagnostic-period-key"><span><i className="previous" /><b>基期</b> {previous.start} 至 {previous.end}</span><span><i className="current" /><b>本期</b> {current.start} 至 {current.end}</span></div>
    <div className="diagnostic-pair-help"><p>{view === "compare" ? "每组两条横柱：蓝色为基期，绿色为本期；数值越大，横柱越长。" : "按增减数值的大小排序，条越长表示变化越大。"} 点击分组可核对来源。</p>
      {view === "rank" && balance.increase > 0 && balance.decrease < 0 && <select aria-label="贡献方向" value={direction} onChange={e => { setDirection(e.target.value as typeof direction); setPage(0); setSelected(null); }}><option value="all">全部增减</option><option value="increase">只看增加</option><option value="decrease">只看减少</option></select>}
    </div>
    {view === "rank" && <div className="diagnostic-rank-key"><span>← 减少</span><span>增加 →</span></div>}
    <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${view}-tab`} className="diagnostic-pair-list">
      {!slice.length ? <p className="diagnostic-plot-empty">两个周期没有可展示的有效分组，请调整日期或指标。</p> : slice.map((g, index) => {
        const active = selected === g.name, sourceId = `${uid}-sources-${page}-${index}`;
        return <div className={`diagnostic-pair-card ${active ? "is-selected" : ""}`} key={g.name}>
          <button className="diagnostic-pair-select" aria-expanded={active} aria-controls={sourceId} aria-label={`${g.name}，基期${formatNumber(g.previous)}，本期${formatNumber(g.current)}，${changeText(g.delta, unit)}，${active ? "收起" : "展开"}来源操作`} onClick={() => setSelected(active ? null : g.name)}>
            <span className="diagnostic-pair-title"><strong>{g.name}</strong><span className={`diagnostic-change-badge ${tone(g.delta)}`}>{g.delta > 0 ? <ArrowUpRight size={15} /> : g.delta < 0 ? <ArrowDownRight size={15} /> : <Minus size={15} />}{changeText(g.delta, unit)}</span></span>
            {view === "compare" ? <span className="diagnostic-pair-series">{(["previous", "current"] as const).map(period => <span className="diagnostic-series-row" key={period}><span className={period}>{period === "previous" ? "基期" : "本期"}</span>{track(g[period], period)}<strong>{formatNumber(g[period])}<small>{unit}</small></strong></span>)}</span> : <span className="diagnostic-rank-series">{track(g.delta, "change")}<span className="diagnostic-rank-zero" style={{left:`${zero}%`}}>0</span></span>}
          </button>
          {active && <div className="diagnostic-pair-sources" id={sourceId}><span>{view === "rank" ? `基期 ${formatNumber(g.previous)} → 本期 ${formatNumber(g.current)}` : "核对这一分组的原始记录"}</span><div className="diagnostic-source-actions"><button onClick={() => onInspect("previous", g.name)}>基期来源 <ArrowUpRight size={14} /></button><button onClick={() => onInspect("current", g.name)}>本期来源 <ArrowUpRight size={14} /></button></div></div>}
        </div>;
      })}
    </div>
    <div className="diagnostic-chart-caption"><span>{ordered.length ? `按变化大小排序，展示第 ${page * 6 + 1}–${Math.min((page + 1) * 6, ordered.length)} 组，共 ${ordered.length} 组。` : "当前没有可展示的分组。"}所有分组和页面使用同一刻度{domain[0] < 0 ? "；负数向零线左侧延伸。" : "。"}</span>{pages > 1 && <nav aria-label="图表分组翻页"><button aria-label="上一页分组" disabled={page === 0} onClick={() => changePage(page - 1)}><ChevronLeft size={16} /></button><span>{page + 1} / {pages}</span><button aria-label="下一页分组" disabled={page + 1 >= pages} onClick={() => changePage(page + 1)}><ChevronRight size={16} /></button></nav>}</div>
    <p className="diagnostic-viz-note">基期是用来对照的时间段，本期是这次关注的时间段。数值增减不代表业务好坏，周期天数不同时需结合上方提示核对。</p>
  </section>;
}
