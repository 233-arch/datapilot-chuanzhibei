"use client";

import { useId, useRef, useState } from "react";
import { ArrowUpRight, ArrowRight, Sparkles, TrendingUp, BarChart3, PieChart, Plus, X, Database } from "lucide-react";

/** A short path from the overview to the existing, traceable analysis workflow. */
export function AnalysisLaunch({ questions, model, busy, onAsk, home = false, fields = [], scopeLabel }: {
  home?: boolean;
  fields?: string[];
  scopeLabel?: string;
  questions: string[];
  model: boolean;
  busy: boolean;
  onAsk: (question: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [showFields, setShowFields] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const submit = () => { if (!draft.trim() || busy) return; onAsk(draft.trim()); setDraft(""); setShowFields(false); };
  return <section className={`analysis-launch${home ? " analysis-launch-home" : ""}`} aria-labelledby={titleId}>
    <div className="analysis-launch-heading">
      <div>{home && <span className="launch-eyebrow"><Sparkles size={15} /> 数问分析助手</span>}<h2 id={titleId}>{home ? "今天，想从数据中了解什么？" : <><Sparkles size={19} />继续探索数据</>}</h2>{home && <p className="launch-description">用一个问题开始，让数据给出有依据的回答。</p>}</div>
      <span className="analysis-launch-mode"><span />{model ? "个人 API 已接入" : "本地分析 · 无需 API"}</span>
    </div>
    <form className="analysis-launch-form" onSubmit={event => {
      event.preventDefault();
      submit();
    }}>
      {home ? <>
        <textarea ref={editor} rows={2} aria-label="向分析助手提问" maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} placeholder={questions[0] ? `例如：${questions[0]}，或输入你关注的指标…` : "例如：数据概览、质量摘要"} />
        <div className="launch-composer-tools"><button type="button" className="launch-field-trigger" aria-expanded={showFields} onClick={() => setShowFields(!showFields)}><Plus size={15} />添加字段</button>{scopeLabel && <span className="launch-scope"><Database size={14} />{scopeLabel}</span>}<span className="launch-keyboard">Ctrl / ⌘ + Enter</span><button type="submit" className="launch-submit" disabled={!draft.trim() || busy} aria-label="开始概览分析"><span>{busy ? "分析中" : "开始分析"}</span><ArrowRight size={18} /></button></div>
      </> : <><Sparkles size={20} aria-hidden="true" /><input aria-label="向分析助手提问" maxLength={2000} value={draft} onChange={event => setDraft(event.target.value)} placeholder={questions[0] ? `试试：${questions[0]}` : "例如：数据概览、质量摘要"} /><button type="submit" disabled={!draft.trim() || busy} aria-label="开始概览分析"><span>{busy ? "分析中" : "开始分析"}</span><ArrowRight size={19} /></button></>}
    </form>
    {home && showFields && <div className="launch-field-picker"><div><strong>插入当前数据的字段</strong><button type="button" aria-label="关闭字段选择" onClick={() => setShowFields(false)}><X size={16} /></button></div><div>{fields.map(field => <button type="button" key={field} onClick={() => { setDraft(value => `${value}${value && !value.endsWith(" ") ? " " : ""}${field} ` .slice(0, 2000)); editor.current?.focus(); }}>{field}</button>)}</div></div>}
    <div className="analysis-launch-suggestions" aria-label="推荐分析问题">
      {questions.slice(0, 3).map((question, index) => {
        const Icon = [TrendingUp, BarChart3, PieChart][index];
        return <button type="button" key={question} disabled={busy} onClick={() => onAsk(question)}><Icon size={16} /><span>{question}</span><ArrowUpRight size={15} /></button>;
      })}
    </div>
    {home && <p className="launch-capability">{model ? "使用已接入的个人 API 解析问题，统计结果由本机计算。" : "支持趋势、排名、占比与质量检查；复杂问题可接入个人 API。"} 分析计划先预览，再由你确认。</p>}
  </section>;
}
