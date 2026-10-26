import { useEffect, useRef, useState } from "react";
import type { Fact } from "@/lib/diagnostics";
import { formatNumber } from "@/lib/data-engine";
import { checkLabels } from "@/lib/explainer";
import { useVisitorModel, visitorModelHeaders } from "@/lib/visitor-model";
import { ApiAccessNotice } from "./visitor-api";
import { Sparkles, ArrowUpRight, LoaderCircle, X } from "lucide-react";
type Guide = {
  focus: string[];
  checks: (keyof typeof checkLabels)[];
  mode: string;
  latencyMs: number;
  usage: { input: number | null; output: number | null };
};
export function EvidenceGuide({
  facts,
  onSource,
}: {
  facts: Fact[];
  onSource?: (fact: Fact) => void;
}) {
  const visitorModel = useVisitorModel();
  const [guide, setGuide] = useState<Guide | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null),
    generation = useRef(0),
    key = JSON.stringify(facts);
  useEffect(() => {
    generation.current++;
    abort.current?.abort();
    setGuide(null);
    setBusy(false);
    setError("");
    return () => {
      generation.current++;
      abort.current?.abort();
    };
  }, [key, visitorModel]);
  async function generate() {
    const current = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...visitorModelHeaders() },
        body: JSON.stringify({ facts }),
        signal: controller.signal,
      });
      const result = (await response.json()) as Guide & { error?: string };
      if (!response.ok) throw new Error(result.error || "解读失败");
      if (current === generation.current) setGuide(result);
    } catch (e) {
      if (current === generation.current && (e as Error).name !== "AbortError")
        setError((e as Error).message);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  const selected = guide
    ? guide.focus
        .map((id) => facts.find((f) => f.id === id))
        .filter((f): f is Fact => !!f)
    : facts.slice(0, 4);
  return (
    <section className="diagnostic-evidence" aria-label="证据导读">
      <div className="diagnostic-heading">
        <div>
          <span className="eyebrow">EVIDENCE FIRST</span>
          <h3>{guide ? "AI 证据导读" : "已计算的分析证据"}</h3>
          <p>核对统计结果与来源明细；接入个人 API 后可解读证据。</p>
        </div>
        {visitorModel && (
          <button
            className="button subtle"
            disabled={busy || !facts.length}
            onClick={generate}
          >
            <Sparkles size={14} />
            {busy ? "正在整理证据…" : guide ? "重新解读" : "AI 解读证据"}
          </button>
        )}
        {busy && (
          <button
            className="icon-button"
            aria-label="取消证据解读"
            onClick={() => {
              generation.current++;
              abort.current?.abort();
              setBusy(false);
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <ApiAccessNotice />
      {busy && (
        <p role="status">
          <LoaderCircle size={14} className="spin" /> 正在选择重要事实与核查事项
        </p>
      )}
      {error && (
        <p className="diagnostic-warning" role="alert">
          {error}
        </p>
      )}
      <div className="fact-grid">
        {selected.map((f) => (
          <article className="fact-card" key={f.id}>
            <small>
              [{f.id}] {f.title}
            </small>
            <strong>
              {f.value === null ? "不适用" : formatNumber(f.value)}
              <em>{f.unit}</em>
            </strong>
            <p>{f.detail}</p>
            {onSource && (
              <button className="text-button" onClick={() => onSource(f)}>
                查看依据 <ArrowUpRight size={12} />
              </button>
            )}
          </article>
        ))}
      </div>
      {guide && (
        <div className="guide-checks">
          <strong>建议进一步核查</strong>
          {guide.checks.map((c, i) => (
            <p key={i}>{checkLabels[c]}</p>
          ))}
          <small>
            真实模型组织事实 · {guide.latencyMs} ms · 输入{" "}
            {guide.usage.input ?? "未知"} / 输出 {guide.usage.output ?? "未知"}{" "}
            tokens；费用以服务商账单为准。数值由本机引擎计算，模型仅选择有效事实编号与核查事项。
          </small>
        </div>
      )}
    </section>
  );
}
