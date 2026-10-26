import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  type KnowledgeDocument,
  type Snippet,
  type knowledgeAnswerSchema,
  retrieveKnowledge,
  starterKnowledge,
  validateDocuments,
  validateKnowledgeAnswer,
} from "@/lib/knowledge";
import type { z } from "zod";
import { useVisitorModel, visitorModelHeaders } from "@/lib/visitor-model";
import { ApiAccessNotice } from "./visitor-api";
type Answer = z.infer<typeof knowledgeAnswerSchema> & {
  usage?: { input: number | null; output: number | null };
  latencyMs?: number;
};
export function KnowledgePanel({
  documents,
  onChange,
}: {
  documents: KnowledgeDocument[];
  onChange: (documents: KnowledgeDocument[]) => void;
}) {
  const visitorModel = useVisitorModel();
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(""),
    [version, setVersion] = useState("1.0"),
    [source, setSource] = useState(""),
    [text, setText] = useState("");
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<Answer | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Snippet | null>(null);
  const controller = useRef<AbortController | null>(null),
    file = useRef<HTMLInputElement>(null);
  const hits = useMemo(
    () => retrieveKnowledge(question, documents),
    [question, documents],
  );
  const signature = JSON.stringify(documents);
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setAnswer(null);
    setSelected(null);
    setError("");
    return () => controller.current?.abort();
  }, [signature, visitorModel]);
  function changeQuestion(value: string) {
    controller.current?.abort();
    setBusy(false);
    setAnswer(null);
    setError("");
    setQuestion(value);
  }
  function save() {
    try {
      onChange(
        validateDocuments([
          ...documents,
          { id: crypto.randomUUID(), title, text, source, version },
        ]),
      );
      setTitle("");
      setSource("");
      setText("");
      setEditing(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "文档格式不正确。");
    }
  }
  async function ask() {
    if (!hits.length || !question.trim()) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const snippets = hits.map(({ score, coverage, ...s }) => s);
      const r = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...visitorModelHeaders() },
        body: JSON.stringify({ question, snippets }),
        signal: c.signal,
      });
      const a = (await r.json()) as Answer & { error?: string };
      if (!r.ok) throw new Error(a.error || "知识回答暂不可用。");
      const validated = validateKnowledgeAnswer(
        { status: a.status, answer: a.answer, citations: a.citations },
        snippets,
      );
      if (!c.signal.aborted && controller.current === c)
        setAnswer({ ...validated, usage: a.usage, latencyMs: a.latencyMs });
    } catch (e) {
      if (!c.signal.aborted && controller.current === c)
        setError(e instanceof Error ? e.message : "回答失败。");
    } finally {
      if (controller.current === c) setBusy(false);
    }
  }
  return (
    <section className="diagnostic-panel knowledge-panel">
      <div className="diagnostic-heading">
        <div>
          <span className="eyebrow">KNOWLEDGE & SOURCES</span>
          <h2>让指标有据可查</h2>
          <p>
            导入业务定义，用检索片段辅助问答和分析计划。文档保存在当前浏览器。
          </p>
        </div>
        <BookOpen size={25} />
      </div>
      <div className="intelligence-actions">
        <button className="button" onClick={() => setEditing((v) => !v)}>
          <Plus size={14} />
          {editing ? "收起编辑" : "添加业务文档"}
        </button>
        {!documents.some((d) => d.id === "demo-definitions") && (
          <button
            className="button subtle"
            disabled={documents.length >= 8}
            onClick={() => {
              try {
                onChange(
                  validateDocuments([...documents, ...starterKnowledge]),
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            载入教学示例
          </button>
        )}
        <span className="diagnostic-note">
          {documents.length}/8 份文档 · 支持 TXT / Markdown
        </span>
      </div>
      {editing && (
        <div className="knowledge-editor">
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            ref={file}
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 128000 || !/\.(txt|md)$/i.test(f.name))
                  throw new Error("请选择128 KB以内的TXT或Markdown文件。");
                const content = await f.text();
                if (content.length > 24000)
                  throw new Error("单份文档最多24,000字符，请分段整理。");
                setText(content);
                setTitle(f.name.slice(0, 100));
                setSource(f.name.slice(0, 180));
                setError("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                if (file.current) file.current.value = "";
              }
            }}
          />
          <button className="text-button" onClick={() => file.current?.click()}>
            从本机选择文本文件
          </button>
          <div className="diagnostic-controls">
            <label>
              文档标题
              <input
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              版本
              <input
                maxLength={40}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </label>
            <label>
              来源说明
              <input
                placeholder="如：2026年社团经费管理办法"
                maxLength={180}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </label>
          </div>
          <label className="intelligence-label">
            文档正文
            <textarea
              rows={7}
              maxLength={24000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="粘贴有权使用的指标定义、统计口径或业务规则。"
            />
          </label>
          <p className="diagnostic-note">
            仅保存你有权使用的内容。模型问答时会发送检索命中的最多4段原文；文档内容不会作为应用操作指令执行。
          </p>
          <button
            className="button"
            disabled={
              !title.trim() ||
              text.trim().length < 10 ||
              !source.trim() ||
              !version.trim()
            }
            onClick={save}
          >
            保存文档
          </button>
        </div>
      )}
      <div className="knowledge-documents">
        {documents.map((d) => (
          <article key={d.id}>
            <FileText size={16} />
            <div>
              <strong>{d.title}</strong>
              <small>
                版本 {d.version} · {d.text.length.toLocaleString()} 字符 ·{" "}
                {d.source}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={"删除文档" + d.title}
              onClick={() => onChange(documents.filter((v) => v.id !== d.id))}
            >
              <Trash2 size={14} />
            </button>
          </article>
        ))}
      </div>
      {!documents.length && (
        <p className="empty-note">
          先添加一份业务定义，或载入明确标注的教学示例。
        </p>
      )}
      <div className="knowledge-query">
        <label className="intelligence-label">
          询问业务口径
          <input
            value={question}
            maxLength={2000}
            onChange={(e) => changeQuestion(e.target.value)}
            placeholder="如：利润率该如何计算？退款是否计入收入？"
          />
        </label>
        <div className="intelligence-actions">
          {visitorModel && (
            <button
              className="button"
              disabled={busy || !hits.length || !question.trim()}
              onClick={ask}
            >
              {busy ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Search size={14} />
          )}
            检索并生成有引用的回答
          </button>
        )}
          {busy && (
            <button
              className="button subtle"
              onClick={() => {
                controller.current?.abort();
                setBusy(false);
              }}
            >
              取消
            </button>
          )}
        </div>
        <p className="diagnostic-note">
          本机使用TF-IDF稀疏向量余弦相似度与词项覆盖混合检索，不使用神经嵌入模型。检索后才请求真实AI；回答仍需核对原文与适用版本。
        </p>
        <ApiAccessNotice />
      </div>
      {question.trim() && !hits.length && (
        <p className="diagnostic-warning" role="status">
          未找到足够相关的片段，请补充业务文档或换用准确的指标名称；此次不会调用模型。
        </p>
      )}
      {error && (
        <p className="diagnostic-warning" role="alert">
          {error}
        </p>
      )}
      {answer && (
        <div className="knowledge-answer" aria-live="polite">
          <span className="eyebrow">
            {answer.status === "conflict"
              ? "发现定义冲突"
              : answer.status === "insufficient"
                ? "依据不足"
                : "AI依据检索片段回答"}
          </span>
          <p>{answer.answer}</p>
          {answer.citations.map((c) => (
            <blockquote key={c.id + ":" + c.quote}>
              <p>{c.quote}</p>
              <button
                className="text-button"
                onClick={() =>
                  setSelected(hits.find((s) => s.id === c.id) || null)
                }
              >
                查看来源 [{c.id}]
              </button>
            </blockquote>
          ))}
          <small>
            耗时 {answer.latencyMs ?? "—"} ms · tokens{" "}
            {answer.usage?.input ?? "—"} / {answer.usage?.output ?? "—"}
            。引用逐字匹配已校验，回答含义与适用性仍需核对。
          </small>
        </div>
      )}
      {!!hits.length && (
        <details className="retrieved-details">
          <summary>查看本次检索的 {hits.length} 个片段</summary>
          {hits.map((h) => (
            <button
              key={h.id}
              className="retrieved-snippet"
              onClick={() => setSelected(h)}
            >
              <strong>
                {h.title} · 第{h.index}段
              </strong>
              <small>
                版本 {h.version} · 相似排序分 {h.score.toFixed(3)}，不是置信度
              </small>
              <span>{h.text.slice(0, 160)}…</span>
            </button>
          ))}
        </details>
      )}
      {selected && (
        <div
          className="knowledge-source"
          role="region"
          aria-label="知识引用原文"
        >
          <div className="diagnostic-heading">
            <h3>
              {selected.title} · 第{selected.index}段
            </h3>
            <button
              className="icon-button"
              aria-label="关闭引用原文"
              onClick={() => setSelected(null)}
            >
              <X size={15} />
            </button>
          </div>
          <small>
            来源：{selected.source} · 版本：{selected.version} · [{selected.id}]
          </small>
          <p>{selected.text}</p>
        </div>
      )}
    </section>
  );
}
