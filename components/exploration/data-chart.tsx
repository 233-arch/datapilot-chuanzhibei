"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Brush, LabelList, ReferenceLine } from "recharts";
import { ArrowDownUp, ArrowUpRight, BarChart3, Download, Hash, Maximize2, RotateCcw, Search, Table2, X } from "lucide-react";
import { type Plan, type AnalysisResult, formatNumber } from "@/lib/data-engine";
import { aggregateLabel, chartColor, chartColors, chartCSV, chartRange, displayedShare, orderChartPoints, pieUnavailable, type ChartPoint } from "@/lib/chart-presentation";

type Props = { plan: Plan; result: AnalysisResult; small?: boolean; onPointClick?: (name: string) => void; onRange?: (start: string, end: string) => void };
function SourceDot({ cx, cy, payload, onSource }: { cx?: number; cy?: number; payload?: ChartPoint; onSource: (name: string) => void }) {
  if (cx === undefined || cy === undefined || !payload) return <g />;
  return <circle cx={cx} cy={cy} r={6} fill="#13876f" stroke="white" strokeWidth={3} role="button" tabIndex={0}
    aria-label={`查看 ${payload.name} 来源明细`} style={{ cursor: "pointer" }} onClick={() => onSource(payload.name)}
    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSource(payload.name); } }} />;
}
function BarValueLabel({ viewBox, value }: { viewBox?: { x?: number; y?: number; width?: number; height?: number }; value?: unknown }) {
  if (!viewBox || viewBox.x === undefined || viewBox.y === undefined || viewBox.width === undefined || viewBox.height === undefined) return null;
  const n = Number(value);
  return <text className="viz-value-label" x={viewBox.x + viewBox.width / 2} y={n < 0 ? viewBox.y + viewBox.height + 17 : viewBox.y - 10} textAnchor="middle" fill={n < 0 ? "#9b603c" : "#3c5f51"} fontSize={13}>{formatNumber(n, true)}</text>;
}

export function DataChart({ plan, result, small = false, onPointClick, onRange }: Props) {
  const id = "viz" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false), [view, setView] = useState<"chart" | "table">("chart");
  const [labels, setLabels] = useState(!small), [hover, setHover] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<"original" | "asc" | "desc">("original");
  const [exported, setExported] = useState(false);
  const [range, setRange] = useState<{ startIndex?: number; endIndex?: number } | null>(null);
  useEffect(() => { setRange(null); setHover(null); setSelected(null); setSort("original"); setExported(false); }, [result, plan]);
  useEffect(() => {
    if (!expanded || !dialog.current) return;
    dialog.current.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);
  const label = plan.aggregate === "count" ? "记录数" : plan.metric + aggregateLabel(plan);
  const palette = chartColors(result.points);
  const color = (name: string) => palette.get(name) || chartColor(name);
  const active = result.points.find(p => p.name === (hover || selected));
  const total = result.points.reduce((sum, p) => sum + p.value, 0);
  const additive = ["sum", "count"].includes(plan.aggregate);
  const negative = result.points.some(p => p.value < 0);
  const pieError = plan.chart === "pie" ? pieUnavailable(result.points, plan.aggregate) : null;
  const candidate = range && chartRange(result.points, range.startIndex, range.endIndex);
  const selection = candidate && (candidate[0] !== result.points[0]?.name || candidate[1] !== result.points.at(-1)?.name) ? candidate : null;
  const close = () => { dialog.current?.close(); setExpanded(false); };
  const inspect = (name: string) => { setSelected(name); if (onPointClick) { if (expanded) close(); onPointClick(name); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([chartCSV(plan, { ...result, points: orderChartPoints(result.points, sort) })], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${plan.title.replace(/[\\/:*?"<>|]/g, "_")}_分组明细.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setExported(true);
  };
  if (!result.points.length) return <div className="chart-empty"><Search size={28} /><p>没有符合条件的数据</p><span>试试调整筛选或分析指标</span></div>;

  const tooltip = <Tooltip isAnimationActive={false} cursor={plan.chart === "line" ? { stroke: "#a0b8af", strokeDasharray: "4 4" } : { fill: "#edf5f1", radius: 6 }}
    content={({ active: showing, payload }) => {
      const point = payload?.[0]?.payload as ChartPoint | undefined;
      if (!showing || !point || typeof point.value !== "number") return null;
      const share = displayedShare(result.points, point, plan.aggregate);
      return <div className="viz-tooltip"><div><i style={{ background: color(point.name) }} /><strong>{point.name}</strong></div>
        <span>{label}</span><b>{formatNumber(point.value)}<small>{result.unit}</small></b>
        <p>有效记录 <strong>{point.count.toLocaleString()} 条</strong></p>
        {share !== null && <p>展示分组内占比 <strong>{share.toFixed(1)}%</strong></p>}
        {onPointClick && <em>点击图形可查看来源</em>}</div>;
    }} />;
  function tableView() {
    return <div className="viz-data"><div className="viz-data-caption"><span>当前展示分组 · {label}{result.unit ? `（${result.unit}）` : ""}</span>
      <button onClick={download}><Download size={14} />导出分组 CSV</button></div>
      <div className="viz-table-scroll"><table><thead><tr><th scope="col">{plan.groupBy}</th>
        <th scope="col" aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"}><button onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>{label} <ArrowDownUp size={13} />{sort === "original" ? "" : sort === "asc" ? "↑" : "↓"}</button></th>
        <th scope="col">有效记录</th>{onPointClick && <th scope="col">来源</th>}</tr></thead>
        <tbody>{orderChartPoints(result.points, sort).map(point => <tr key={point.name}><th scope="row"><i style={{ background: color(point.name) }} />{point.name}</th><td>{formatNumber(point.value)}</td><td>{point.count.toLocaleString()} 条</td>
          {onPointClick && <td><button aria-label={`查看 ${point.name} 来源明细`} onClick={() => inspect(point.name)}><ArrowUpRight size={16} />查看</button></td>}</tr>)}</tbody></table></div>
      {sort !== "original" && <div className="viz-table-note"><span>仅调整明细顺序，分析口径不变</span><button onClick={() => setSort("original")}><RotateCcw size={13} />恢复顺序</button></div>}
      {exported && <p className="viz-export-status" role="status">已生成 {result.points.length} 个分组的 CSV，保留当前明细顺序与原始精度。</p>}
    </div>;
  }
  function canvas(focus: boolean) {
    const uid = id + (focus ? "focus" : "inline");
    const tiny = small && !focus;
    const showLabels = labels && result.points.length <= 12;
    const margin = { top: showLabels ? 32 : 20, right: 24, bottom: 8, left: 4 };
    const xaxis = <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={12} minTickGap={20}
      tick={{ fontSize: 13, fill: "#5f746b" }} tickFormatter={s => /^\d{4}-\d{2}$/.test(String(s)) ? `${Number(String(s).slice(5))}月` : String(s).length > (focus ? 14 : 8) ? String(s).slice(0, focus ? 13 : 7) + "…" : String(s)} />;
    const yaxis = <YAxis width={62} padding={{ bottom: negative && showLabels ? 24 : 0 }} axisLine={false} tickLine={false} tickMargin={8} tick={{ fontSize: 13, fill: "#6c7e76" }} tickFormatter={n => formatNumber(Number(n), true)} />;
    const grid = <CartesianGrid vertical={false} stroke="#e5ede8" strokeDasharray="3 5" />;
    const defs = <defs>{result.points.map((p, i) => <linearGradient id={`${uid}bar${i}`} key={p.name} x1="0" y1="0" x2="0" y2="1"><stop stopColor={p.value < 0 ? "#c87852" : color(p.name)} stopOpacity={0.92} /><stop offset="100%" stopColor={p.value < 0 ? "#c87852" : color(p.name)} stopOpacity={0.6} /></linearGradient>)}
      <linearGradient id={`${uid}area`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#13876f" stopOpacity={0.23} /><stop offset="95%" stopColor="#13876f" stopOpacity={0.015} /></linearGradient></defs>;
    return <div className={`viz-canvas ${plan.chart === "pie" ? "viz-donut" : ""} ${tiny ? "viz-compact" : ""}`}>
      <div className="viz-plot" role="group" aria-label={`${plan.title}。${result.summary}`}>
      {pieError ? <div className="chart-empty"><BarChart3 size={28} /><p>{pieError}</p><span>切换柱状图、折线图或明细查看结果</span></div> : <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180} initialDimension={{ width: 420, height: tiny ? 230 : 310 }}>
        {plan.chart === "pie" ? <PieChart accessibilityLayer><Pie data={result.points} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="63%" outerRadius="86%" paddingAngle={result.points.length > 1 ? 2.5 : 0} cornerRadius={5} stroke="#fff" strokeWidth={2} isAnimationActive={focus ? false : "auto"} animationDuration={420}
          onMouseEnter={(_p, i) => setHover(result.points[i]?.name || null)} onMouseLeave={() => setHover(null)} onClick={(_p, i) => { if (result.points[i]) inspect(result.points[i].name); }}>
          {result.points.map(point => <Cell key={point.name} fill={color(point.name)} opacity={active && active.name !== point.name ? 0.26 : 1} />)}</Pie>{tooltip}</PieChart>
        : plan.chart === "line" ? <AreaChart data={result.points} margin={margin} accessibilityLayer>{defs}{grid}{xaxis}{yaxis}{negative && <ReferenceLine y={0} stroke="#a7b7ae" />}{tooltip}
          {onRange && result.points.length > 1 && <Brush dataKey="name" height={27} stroke="#92b6a6" fill="#f3f8f5" travellerWidth={9}
            startIndex={Math.min(result.points.length - 1, range?.startIndex ?? 0)} endIndex={Math.min(result.points.length - 1, range?.endIndex ?? result.points.length - 1)}
            onChange={v => setRange(v)} tickFormatter={v => String(v).slice(0, 10)} />}
          <Area type="linear" dataKey="value" stroke="#13876f" strokeWidth={3} fill={`url(#${uid}area)`} dot={result.points.length <= 20 ? { r: 3.5, fill: "#fff", strokeWidth: 2 } : false} activeDot={<SourceDot onSource={inspect} />} isAnimationActive={focus ? false : "auto"} animationDuration={420}>
            {showLabels && <LabelList className="viz-line-labels" dataKey="value" position="top" offset={12} fontSize={13} fill="#3c5f51" formatter={v => formatNumber(Number(v), true)} />}
          </Area></AreaChart>
        : <BarChart data={result.points} margin={margin} barCategoryGap="25%" accessibilityLayer>{defs}{grid}{xaxis}{yaxis}{negative && <ReferenceLine y={0} stroke="#a7b7ae" />}{tooltip}
          <Bar dataKey="value" maxBarSize={focus ? 64 : 48} radius={[7, 7, 3, 3]} activeBar={{ stroke: "#174e3e", strokeWidth: 1.5 }} isAnimationActive={focus ? false : "auto"} animationDuration={420}
            onMouseEnter={(_p, i) => setHover(result.points[i]?.name || null)} onMouseLeave={() => setHover(null)} onClick={(_p, i) => { if (result.points[i]) inspect(result.points[i].name); }}>
            {result.points.map((point, i) => <Cell key={point.name} fill={`url(#${uid}bar${i})`} opacity={active && active.name !== point.name ? 0.35 : 1} cursor={onPointClick ? "pointer" : undefined} />)}
            {showLabels && <LabelList dataKey="value" content={<BarValueLabel />} />}
          </Bar></BarChart>}
      </ResponsiveContainer>}
      {plan.chart === "pie" && !pieError && <div className="viz-donut-center" aria-hidden="true"><span>{active?.name || (additive ? "展示合计" : "展示分组")}</span><strong>{formatNumber(active?.value ?? (additive ? total : result.points.length), true)}</strong><small>{active || additive ? result.unit : "组"}</small></div>}
      </div>
      {plan.chart === "pie" && !pieError && <div className="viz-legend" aria-label="图例联动">{result.points.map(point => {
        const share = displayedShare(result.points, point, plan.aggregate);
        return <button key={point.name} className={selected === point.name ? "selected" : ""} aria-pressed={selected === point.name} aria-label={`突出显示 ${point.name}`}
          onMouseEnter={() => setHover(point.name)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(point.name)} onBlur={() => setHover(null)} onClick={() => setSelected(selected === point.name ? null : point.name)}>
          <i style={{ background: color(point.name) }} /><span title={point.name}>{point.name}<small>{point.count.toLocaleString()} 条有效记录</small></span><strong>{formatNumber(point.value, true)}{share !== null && <small>{share.toFixed(1)}%</small>}</strong></button>;
      })}<p>{additive ? "占比仅针对当前展示分组" : "各组数值独立统计，不相加计算占比"}</p></div>}
    </div>;
  }
  function content(focus: boolean) {
    return <><div className="viz-toolbar"><span className="viz-scope">{result.points.length} 个分组<span> · 有效 {result.validRows.toLocaleString()} 条</span></span><div className="viz-actions">
      <div className="viz-switch" role="group" aria-label="图表与明细"><button aria-pressed={view === "chart"} onClick={() => setView("chart")}><BarChart3 size={14} />图表</button><button aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 size={14} />明细</button></div>
      {view === "chart" && plan.chart !== "pie" && result.points.length <= 12 && <button aria-label="显示数值标签" aria-pressed={labels} onClick={() => setLabels(!labels)}><Hash size={14} /><span>数值</span></button>}
      {!focus && <button aria-label={`放大 ${plan.title}`} onClick={() => setExpanded(true)}><Maximize2 size={14} /><span>放大</span></button>}</div></div>
      {view === "table" ? tableView() : canvas(focus)}
      {view === "chart" && selected && plan.chart === "pie" && <div className="viz-selection"><span>已突出 <strong>{selected}</strong></span><div>{onPointClick && <button onClick={() => inspect(selected)}>查看来源 <ArrowUpRight size={14} /></button>}<button aria-label="清除图例高亮" onClick={() => { setSelected(null); setHover(null); }}><X size={14} /></button></div></div>}
      {view === "chart" && onRange && plan.chart === "line" && selection && <div className="viz-range"><span>{selection[0]} — {selection[1]}</span><button onClick={() => { if (expanded) close(); onRange(...selection); setRange(null); }}>应用时间范围 <ArrowUpRight size={14} /></button></div>}
    </>;
  }
  return <div className={`interactive-chart ${small ? "is-small" : ""} ${result.points.length > 5 ? "is-dense" : ""}`}>
    {content(false)}
    <dialog className="viz-dialog" ref={dialog} aria-labelledby={`${id}title`} onClose={() => setExpanded(false)} onCancel={() => setExpanded(false)} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      {expanded && <div className="viz-focus"><header><div><span>图表详情</span><h2 id={`${id}title`}>{plan.title}</h2><p>{plan.groupBy} · {label}{result.unit ? ` · 单位 ${result.unit}` : ""}</p></div><button autoFocus aria-label="关闭放大图表" onClick={close}><X size={20} /></button></header>
        {content(true)}<p className="viz-focus-summary">{result.summary}</p></div>}
    </dialog>
  </div>;
}
