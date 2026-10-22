"use client";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, GitBranch, Pause, Play, Route, ShieldCheck, Sparkles, TrendingUp, X } from "lucide-react";
import type { Plan, AnalysisResult } from "@/lib/data-engine";
import { aggregateLabels, type ExplorationTask, type JourneyState } from "@/lib/copilot";

export function ExplorationNavigator({ tasks, count, disabled, onPreview, onAsk }: {
  tasks: ExplorationTask[]; count: number; disabled: boolean;
  onPreview: (task: ExplorationTask) => void; onAsk: (question: string) => void;
}) {
  return <div className="copilot-navigator">
    <div className="navigator-lead"><span><Route size={19}/></span><h2>下一步，值得探索什么？</h2><p>根据当前 {count.toLocaleString()} 条记录生成建议，筛选变化时同步更新。</p></div>
    {!tasks.length && <div className="navigator-empty">当前范围没有可探索的建议。试试重置筛选，或在对话中指定字段。</div>}
    {tasks.map((task,i) => <article className="navigator-task" key={task.id}>
      <div className="navigator-task-label"><span>0{i+1}</span>{task.kind === "trend" ? <TrendingUp size={14}/> : task.kind === "quality" ? <ShieldCheck size={14}/> : <GitBranch size={14}/>}</div>
      <h3>{task.title}</h3><p>{task.reason}</p>
      <div className="navigator-actions"><button disabled={disabled} onClick={() => onPreview(task)}>预览这项分析 <ArrowRight size={13}/></button>{task.kind !== "quality" && <button className="text-button" disabled={disabled} onClick={() => onAsk(task.question)}><Sparkles size={12}/>交给助手</button>}</div>
    </article>)}
    <p className="navigator-note"><ShieldCheck size={12}/>建议由当前数据规则生成；“交给助手”使用上方标记的分析引擎。</p>
  </div>;
}

export function PlanReview({ question, plan, result, mode, onApply, onDiscard }: {
  question: string; plan: Plan; result: AnalysisResult; mode: "model" | "demo" | "navigator";
  onApply: () => void; onDiscard: () => void;
}) {
  return <section className="plan-review" aria-label="待确认分析计划">
    <div className="plan-review-heading"><span><Sparkles size={15}/>先核对，再应用</span><small>{mode === "model" ? "模型规划" : mode === "navigator" ? "数据导航" : "演示规划"}</small></div>
    <p className="plan-question">{question}</p>
    <dl><div><dt>分组</dt><dd>{plan.groupBy}{plan.chart === "line" ? ` · 按${plan.timeGrain === "month" ? "月" : "日"}` : ""}</dd></div><div><dt>指标</dt><dd>{plan.aggregate === "count" ? "记录数" : `${plan.metric} · ${aggregateLabels[plan.aggregate]}`}</dd></div><div><dt>范围</dt><dd>{result.matchedRows.toLocaleString()} 条匹配 / {result.validRows.toLocaleString()} 条有效</dd></div></dl>
    {(plan.filters || []).length > 0 && <div className="plan-filter-list">{plan.filters!.map((f,i) => <span key={i}>{f.field} {({eq:"=",contains:"包含",gte:"≥",lte:"≤",missing:"为空",bucket:"时间分组",group:"分组"})[f.operator]} {f.value}</span>)}</div>}
    <details><summary>查看本机试算结果</summary><p>{result.summary}</p><small>仅试算，确认前不会更改工作台。</small></details>
    <div className="plan-review-actions"><button className="button primary" onClick={onApply}><Check size={14}/>应用到工作台</button><button className="icon-button" aria-label="放弃这项计划" title="放弃这项计划" onClick={onDiscard}><X size={16}/></button></div>
  </section>;
}

export function AnalysisJourney({ state, playing, onRestore, onPlay, onPause }: {
  state: JourneyState; playing: boolean; onRestore: (index: number) => void; onPlay: () => void; onPause: () => void;
}) {
  if (!state.steps.length) return null;
  const current = state.steps[state.cursor];
  return <section className={`analysis-journey ${playing ? "is-playing" : ""}`} aria-label="分析路线回放">
    <div className="journey-heading"><span className="journey-icon"><Route size={17}/></span><div><strong>探索路线</strong><small aria-live="polite">{playing ? "正在回放" : "自动记录口径与筛选"} · {state.cursor+1}/{state.steps.length}</small></div>
      <div className="journey-controls"><button className="icon-button" aria-label="上一步分析" disabled={state.cursor <= 0} onClick={() => onRestore(state.cursor-1)}><ChevronLeft size={16}/></button><button className="journey-play" disabled={state.steps.length < 2} onClick={playing ? onPause : onPlay}>{playing ? <Pause size={13}/> : <Play size={13}/>}<span>{playing ? "暂停" : "回放"}</span></button><button className="icon-button" aria-label="下一步分析" disabled={state.cursor >= state.steps.length-1} onClick={() => onRestore(state.cursor+1)}><ChevronRight size={16}/></button></div>
    </div>
    <details className="journey-details"><summary><span>{current?.label}</span><span>展开路线 <ChevronRight size={12}/></span></summary><div className="journey-track">{state.steps.map((step,i) => <button key={step.id} aria-current={i === state.cursor ? "step" : undefined} className={i === state.cursor ? "selected" : ""} onClick={() => onRestore(i)}><span>{String(i+1).padStart(2,"0")}</span><strong>{step.label}</strong><small>{step.plan.filters?.length || 0} 项筛选</small></button>)}</div><p><Clock3 size={11}/>最多保存当前数据的 20 步；恢复旧步骤后继续探索，会从该步骤建立新路线。原始数据保持不变。</p></details>
  </section>;
}
