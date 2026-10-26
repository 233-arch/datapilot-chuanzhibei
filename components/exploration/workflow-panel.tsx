import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleHelp,
  LoaderCircle,
  Play,
  Sparkles,
  Square,
} from "lucide-react";
import {
  type Dataset,
  type Profile,
  type FilterClause,
  filterDataset,
  formatNumber,
} from "@/lib/data-engine";
import {
  type PeriodComparison,
  type Fact,
  periodDefaults,
} from "@/lib/diagnostics";
import {
  type WorkflowPlan,
  type WorkflowState,
  type SavedMetric,
  validateWorkflowPlan,
  workflowScopeKey,
} from "@/lib/workbench";
import {
  type KnowledgeDocument,
  type Snippet,
  retrieveKnowledge,
} from "@/lib/knowledge";
import {
  type WorkflowComparison,
  type WorkflowGuide,
  workflowFacts,
  workflowSource,
  workflowMarkdown,
} from "@/lib/workflow-run";
import { validateGuide, checkLabels } from "@/lib/explainer";
import { backgroundTask } from "@/lib/background";
import { useVisitorModel, visitorModelHeaders } from "@/lib/visitor-model";
import { ApiAccessNotice } from "./visitor-api";
type Run = {
  key: string;
  quality: Profile;
  comparisons: WorkflowComparison[];
  facts: Fact[];
  guide: WorkflowGuide | null;
  guideError: string;
};
export function WorkflowPanel({
  dataset,
  profile,
  filters,
  state,
  onChange,
  documents,
  metrics,
  onInspect,
  onExport,
  onOpenDiagnostic,
}: {
  dataset: Dataset;
  profile: Profile;
  filters: FilterClause[];
  state: WorkflowState;
  onChange: (s: WorkflowState) => void;
  documents: KnowledgeDocument[];
  metrics: SavedMetric[];
  onInspect: (source: Dataset, title: string) => void;
  onExport: (name: string, text: string) => void;
  onOpenDiagnostic: (plan: WorkflowPlan) => void;
}) {
  const visitorModel = useVisitorModel();
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState(-1),
    [error, setError] = useState(""),
    [run, setRun] = useState<Run | null>(null);
  const [planningInfo, setPlanningInfo] = useState<{
    latencyMs: number;
    usage: { input: number | null; output: number | null };
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const dims = profile.fields.filter((f) => f.type === "text"),
    nums = profile.fields.filter((f) => f.type === "number"),
    dates = profile.fields.filter((f) => f.type === "date");
  const contexts = useMemo(
    () =>
      profile.fields
        .filter((f) => f.type === "date")
        .slice(0, 4)
        .map((f) => ({ date: f.name, ...periodDefaults(dataset, f.name) })),
    [dataset, profile],
  );
  const snippets = useMemo(
    () =>
      retrieveKnowledge(state.question, documents).map(
        ({ score, coverage, ...s }) => s,
      ),
    [state.question, documents],
  );
  const basis = JSON.stringify({
    dataset: dataset.id,
    fields: profile.fields.map((f) => [
      f.name,
      f.type,
      f.description,
      f.aliases,
      f.unit,
    ]),
    filters,
    documents,
  });
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setStage(-1);
    setRun(null);
    setError("");
    return () => controller.current?.abort();
  }, [basis, visitorModel]);
  const canPlan = !!dates.length && !!nums.length && !!dims.length;
  const scope = useMemo(
    () => filterDataset(dataset, filters, profile),
    [dataset, filters, profile],
  );
  function reset() {
    controller.current?.abort();
    setBusy(false);
    setStage(-1);
    setError("");
    setRun(null);
  }
  function editPlan(p: WorkflowPlan) {
    reset();
    onChange({ ...state, plan: p });
  }
  function stop() {
    controller.current?.abort();
    setBusy(false);
    setError("任务已取消，当前计算未形成完整报告。可以重新执行已确认的计划。");
  }
  function active(c: AbortController) {
    return !c.signal.aborted && controller.current === c;
  }
  async function generate() {
    reset();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setPlanningInfo(null);
    try {
      const r = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...visitorModelHeaders() },
        signal: c.signal,
        body: JSON.stringify({
          question: state.question,
          profile: {
            ...profile,
            fields: profile.fields.map((f) => ({ ...f, topValues: [] })),
          },
          filters,
          contexts,
          snippets,
        }),
      });
      const a = (await r.json()) as {
        plan: unknown;
        error?: string;
        latencyMs: number;
        usage: { input: number | null; output: number | null };
      };
      if (!r.ok) throw new Error(a.error || "计划生成失败。");
      const plan = validateWorkflowPlan(
        a.plan,
        profile,
        snippets.map((s) => s.id),
      );
      if (active(c)) {
        onChange({ ...state, plan });
        setPlanningInfo({ latencyMs: a.latencyMs, usage: a.usage });
      }
    } catch (e) {
      if (active(c)) setError((e as Error).message);
    } finally {
      if (controller.current === c) setBusy(false);
    }
  }
  async function guideFor(computed: Run, c: AbortController) {
    const r = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...visitorModelHeaders() },
      signal: c.signal,
      body: JSON.stringify({ facts: computed.facts }),
    });
    const a = (await r.json()) as WorkflowGuide & { error?: string };
    if (!r.ok) throw new Error(a.error || "证据导读未完成。");
    const guide = validateGuide(
      { focus: a.focus, checks: a.checks },
      computed.facts,
    );
    return {
      ...guide,
      latencyMs: a.latencyMs,
      usage: a.usage,
    } as WorkflowGuide;
  }
  async function execute() {
    if (!state.plan) return;
    reset();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setStage(0);
    try {
      const plan = validateWorkflowPlan(
        state.plan,
        profile,
        snippets.map((s) => s.id),
      );
      const key = workflowScopeKey(dataset.id, profile, filters, plan);
      const quality = await backgroundTask<Profile>("profile", scope, c.signal);
      if (!active(c)) return;
      const comparisons: WorkflowComparison[] = [];
      for (let i = 0; i < plan.dimensions.length; i++) {
        setStage(i === 0 ? 1 : 2);
        const result = await backgroundTask<PeriodComparison>(
          "comparison",
          {
            dataset,
            profile,
            input: { ...plan, dimension: plan.dimensions[i], filters },
          },
          c.signal,
        );
        if (!active(c)) return;
        comparisons.push({ dimension: plan.dimensions[i], result });
      }
      const computed: Run = {
        key,
        quality,
        comparisons,
        facts: workflowFacts(comparisons),
        guide: null,
        guideError: "",
      };
      setRun(computed);
      if (!visitorModel) {
        setRun({ ...computed, guideError: "本机计算已完成。AI 解读需先配置你自己的 API。" });
        setStage(4);
        return;
      }
      setStage(3);
      try {
        const guide = await guideFor(computed, c);
        if (active(c)) {
          setRun({ ...computed, guide });
          setStage(4);
        }
      } catch (e) {
        if (active(c)) {
          setRun({ ...computed, guideError: (e as Error).message });
          setStage(4);
        }
      }
    } catch (e) {
      if (active(c)) {
        setError((e as Error).message);
        setStage(-1);
      }
    } finally {
      if (controller.current === c) setBusy(false);
    }
  }
  async function retryGuide() {
    if (!run) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setStage(3);
    try {
      const guide = await guideFor(run, c);
      if (active(c)) setRun({ ...run, guide, guideError: "" });
    } catch (e) {
      if (active(c)) setRun({ ...run, guideError: (e as Error).message });
    } finally {
      if (active(c)) {
        setBusy(false);
        setStage(4);
      }
    }
  }
  function showSource(
    dimension: string,
    period: "current" | "previous" | "both",
    group?: string,
  ) {
    if (state.plan)
      onInspect(
        workflowSource(
          dataset,
          profile,
          filters,
          state.plan,
          dimension,
          period,
          group,
        ),
        `${dimension}${group ? " · " + group : ""} · ${period === "current" ? "本期" : period === "previous" ? "基期" : "两期"}来源`,
      );
  }
  function factSource(f: Fact) {
    const index = f.id.match(/^dimension-(\d+)-/),
      dimension = index
        ? run?.comparisons[Number(index[1])]?.dimension
        : state.plan?.dimensions[0];
    if (dimension)
      showSource(
        dimension,
        f.id === "current"
          ? "current"
          : f.id === "previous"
            ? "previous"
            : "both",
        f.group,
      );
  }
  const plan = state.plan;
  let validRun: Run | null = null;
  try {
    if (
      run &&
      plan &&
      run.key === workflowScopeKey(dataset.id, profile, filters, plan)
    )
      validRun = run;
  } catch {
    /* Draft dates and dimensions are validated on confirmation. */
  }
  return (
    <section className="diagnostic-panel workflow-panel">
      <div className="diagnostic-heading">
        <div>
          <span className="eyebrow">GUIDED ANALYSIS</span>
          <h2>把一个问题，变成一条分析路线</h2>
          <p>
            AI规划 → 你确认口径 → 本机逐步计算 → AI选择证据 → 导出可复核报告。
          </p>
        </div>
        <Sparkles size={25} />
      </div>
      <label className="intelligence-label">
        你想核查什么？
        <textarea
          rows={3}
          value={state.question}
          maxLength={2000}
          disabled={busy}
          onChange={(e) => {
            reset();
            onChange({ question: e.target.value, plan: null });
          }}
          placeholder="如：比较最新月份与上月的利润，按地区和产品类别拆解变化"
        />
      </label>
      <div className="intelligence-actions">
        <button
          className="button"
          disabled={busy || !canPlan || !state.question.trim() || !visitorModel}
          onClick={generate}
        >
          {busy && !plan ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Sparkles size={14} />
          )}
          生成分析计划
        </button>
        {busy && (
          <button className="button subtle" onClick={stop}>
            <Square size={13} />
            取消任务
          </button>
        )}
      </div>
      <ApiAccessNotice />
      <p className="diagnostic-note">
        仅支持合计指标的周期比较与最多3个维度分解。字段定义、日期上下文、已有筛选及命中的知识片段会发给模型，完整表格留在本机。分解结果不能证明业务因果。
      </p>
      {!canPlan && (
        <p className="diagnostic-warning">
          需要日期、数值和文本分组字段。请导入合适数据，或使用校园消费场景。
        </p>
      )}
      {error && (
        <p role="alert" className="diagnostic-warning">
          {error}
        </p>
      )}
      {plan && (
        <div className="workflow-plan">
          <div className="diagnostic-heading">
            <div>
              <h3>确认分析口径</h3>
              <p>
                {plan.title} · 当前全局筛选 {filters.length} 项保持生效
              </p>
            </div>
            <CircleHelp size={18} />
          </div>
          <fieldset disabled={busy} className="workflow-plan-fields">
            <div className="diagnostic-controls">
              <label>
                日期
                <select
                  value={plan.date}
                  onChange={(e) => editPlan({ ...plan, date: e.target.value })}
                >
                  {dates.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label>
                合计指标
                <select
                  value={plan.metric}
                  onChange={(e) =>
                    editPlan({ ...plan, metric: e.target.value })
                  }
                >
                  {nums.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="workflow-dimensions">
              <span>分解维度（1–3个）</span>
              {dims.map((d) => (
                <label key={d.name}>
                  <input
                    type="checkbox"
                    checked={plan.dimensions.includes(d.name)}
                    disabled={
                      !plan.dimensions.includes(d.name) &&
                      plan.dimensions.length >= 3
                    }
                    onChange={(e) =>
                      editPlan({
                        ...plan,
                        dimensions: e.target.checked
                          ? [...plan.dimensions, d.name]
                          : plan.dimensions.filter((n) => n !== d.name),
                      })
                    }
                  />
                  {d.name}
                </label>
              ))}
            </div>
            <div className="period-grid">
              {(["current", "previous"] as const).map((key) => (
                <div className="workflow-period" key={key}>
                  <strong>{key === "current" ? "本期" : "基期"}</strong>
                  {(["start", "end"] as const).map((edge) => (
                    <label key={edge}>
                      {edge === "start" ? "开始" : "结束"}
                      <input
                        type="date"
                        aria-label={`助手${key === "current" ? "本期" : "基期"}${edge === "start" ? "开始" : "结束"}`}
                        value={plan[key][edge]}
                        onInput={(e) =>
                          editPlan({
                            ...plan,
                            [key]: {
                              ...plan[key],
                              [edge]: e.currentTarget.value,
                            },
                          })
                        }
                        onChange={(e) =>
                          editPlan({
                            ...plan,
                            [key]: { ...plan[key], [edge]: e.target.value },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>
          {planningInfo && (
            <small className="diagnostic-note">
              真实模型规划 {planningInfo.latencyMs} ms · tokens{" "}
              {planningInfo.usage?.input ?? "—"} /{" "}
              {planningInfo.usage?.output ?? "—"}
            </small>
          )}
          {!!plan.knowledgeIds.length && (
            <details>
              <summary>
                计划参考的业务定义（{plan.knowledgeIds.length}）
              </summary>
              {snippets
                .filter((s) => plan.knowledgeIds.includes(s.id))
                .map((s) => (
                  <blockquote key={s.id}>
                    <strong>
                      {s.title} · 版本 {s.version}
                    </strong>
                    <p>{s.text}</p>
                    <small>
                      {s.source} · [{s.id}]
                    </small>
                  </blockquote>
                ))}
            </details>
          )}
          <div className="intelligence-actions">
            <button className="button" disabled={busy} onClick={execute}>
              <Play size={14} />
              确认口径并逐步执行
            </button>
            <button
              className="button subtle"
              disabled={busy}
              onClick={() => {
                try {
                  onOpenDiagnostic(validateWorkflowPlan(plan, profile));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              在业务诊断中调整
            </button>
          </div>
        </div>
      )}
      {(busy || stage >= 0) && (
        <ol className="workflow-steps" aria-live="polite">
          {["核对数据范围", "比较两个周期", "拆解各维度贡献", "AI证据导读"].map(
            (label, i) => (
              <li
                key={label}
                className={
                  stage > i && !(i === 3 && run?.guideError)
                    ? "done"
                    : stage === i
                      ? "active"
                      : ""
                }
              >
                {stage > i && !(i === 3 && run?.guideError) ? (
                  <Check size={15} />
                ) : stage === i && busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <span>{i + 1}</span>
                )}
                <div>
                  <strong>{label}</strong>
                  <small>
                    {i === 3 && run?.guideError
                      ? "未完成，可重试"
                      : stage > i
                        ? "已完成"
                        : stage === i && busy
                          ? "正在处理"
                          : "等待执行"}
                  </small>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
      {validRun && (
        <div className="workflow-results">
          <div className="scope-summary">
            当前范围 {validRun.quality.rowCount.toLocaleString()} 条 ·
            缺失单元格 {validRun.quality.missing} · 完全重复{" "}
            {validRun.quality.duplicates}。保留原记录，未自动清洗。
          </div>
          {validRun.comparisons.map((c) => (
            <article className="workflow-comparison" key={c.dimension}>
              <h3>按{c.dimension}拆解</h3>
              <div className="comparison-kpis">
                <div>
                  <span>基期</span>
                  <strong>{formatNumber(c.result.previous)}</strong>
                </div>
                <div>
                  <span>本期</span>
                  <strong>{formatNumber(c.result.current)}</strong>
                </div>
                <div>
                  <span>变化金额</span>
                  <strong>{formatNumber(c.result.delta)}</strong>
                </div>
                <div>
                  <span>增长率</span>
                  <strong>
                    {c.result.growth === null
                      ? "不适用"
                      : formatNumber(c.result.growth * 100) + "%"}
                  </strong>
                </div>
              </div>
              <div className="diagnostic-table">
                <table>
                  <thead>
                    <tr>
                      <th>分组</th>
                      <th>基期</th>
                      <th>本期</th>
                      <th>贡献差额</th>
                      <th>核对</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.result.groups.slice(0, 8).map((g) => (
                      <tr key={g.name}>
                        <td>{g.name}</td>
                        <td>{formatNumber(g.previous)}</td>
                        <td>{formatNumber(g.current)}</td>
                        <td className={g.delta < 0 ? "decline" : "increase"}>
                          {formatNumber(g.delta)}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() =>
                              showSource(c.dimension, "both", g.name)
                            }
                          >
                            来源
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small>
                预览贡献绝对值最大的8组，导出保留全部{c.result.groups.length}
                组。
              </small>
              {!!c.result.warnings.length && (
                <details>
                  <summary>核查提醒 {c.result.warnings.length} 项</summary>
                  <ul>
                    {c.result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
          {validRun.guide && (
            <div className="workflow-evidence">
              <h3>AI选择的核查重点</h3>
              {validRun.guide.focus.map((id) => {
                const f = validRun.facts.find((f) => f.id === id);
                return (
                  f && (
                    <button
                      key={id}
                      className="workflow-fact"
                      onClick={() => factSource(f)}
                    >
                      <span>{f.title}</span>
                      <strong>
                        {f.value === null
                          ? "不适用"
                          : formatNumber(f.value) + f.unit}
                      </strong>
                      <small>{f.detail} · 查看来源</small>
                    </button>
                  )
                );
              })}
              <ul>
                {validRun.guide.checks.map((c) => (
                  <li key={c}>{checkLabels[c]}</li>
                ))}
              </ul>
              <small>
                真实模型导读 {validRun.guide.latencyMs} ms · tokens{" "}
                {validRun.guide.usage?.input ?? "—"} /{" "}
                {validRun.guide.usage?.output ?? "—"}
              </small>
            </div>
          )}
          {validRun.guideError && (
            <p role="status" className="diagnostic-warning">
              {validRun.guideError} 已计算的结果仍可核对和导出。{" "}
              <button
                className="text-button"
                disabled={busy || !visitorModel}
                onClick={retryGuide}
              >
                重试证据导读
              </button>
            </p>
          )}
          <div className="intelligence-actions">
            <button
              className="button"
              disabled={busy || !plan}
              onClick={() =>
                plan &&
                onExport(
                  "DataPilot_多步骤分析报告.md",
                  workflowMarkdown(
                    plan,
                    filters,
                    validRun.quality,
                    validRun.comparisons,
                    validRun.guide,
                    snippets,
                    metrics,
                    scope,
                  ),
                )
              }
            >
              <ArrowDownToLine size={14} />
              导出完整分析报告
            </button>
          </div>
          <p className="diagnostic-note">
            每个维度解释的是同一个总体差额，不将不同维度的贡献相加。计划会随工作区保存；刷新后需重新执行，以核对当前数据。
          </p>
        </div>
      )}
    </section>
  );
}
