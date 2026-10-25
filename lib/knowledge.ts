import { z } from "zod";
export const knowledgeDocumentSchema = z
  .object({
    id: z.string().min(1).max(60),
    title: z.string().trim().min(1).max(100),
    text: z.string().trim().min(10).max(24000),
    version: z.string().trim().min(1).max(40),
    source: z.string().trim().min(1).max(180),
  })
  .strict();
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export const snippetSchema = z
  .object({
    id: z.string().min(1).max(80),
    documentId: z.string().min(1).max(60),
    title: z.string().min(1).max(100),
    text: z.string().min(1).max(900),
    version: z.string().min(1).max(40),
    source: z.string().min(1).max(180),
    index: z.number().int().min(1).max(500),
  })
  .strict();
export type Snippet = z.infer<typeof snippetSchema>;
export type KnowledgeHit = Snippet & { score: number; coverage: number };
export function validateDocuments(value: unknown): KnowledgeDocument[] {
  const docs = z.array(knowledgeDocumentSchema).max(8).parse(value);
  if (
    new Set(docs.map((d) => d.id)).size !== docs.length ||
    docs.reduce((n, d) => n + d.text.length, 0) > 96000
  )
    throw new Error("文档编号重复或知识库超过96,000字符。");
  return docs;
}
export function splitDocuments(docs: KnowledgeDocument[]): Snippet[] {
  return validateDocuments(docs).flatMap((doc) => {
    const segments: string[] = [];
    let current = "";
    const paragraphs = doc.text
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n|(?<=[。！？])\s*\n/);
    for (const paragraph of paragraphs) {
      for (let offset = 0; offset < paragraph.length; offset += 700) {
        const part = paragraph.slice(offset, offset + 700).trim();
        if (!part) continue;
        if (current && current.length + part.length + 1 > 800) {
          segments.push(current);
          current = "";
        }
        current += (current ? "\n" : "") + part;
      }
    }
    if (current) segments.push(current);
    return segments.map((text, index) => ({
      documentId: doc.id,
      id: doc.id + ":" + (index + 1),
      title: doc.title,
      text,
      version: doc.version,
      source: doc.source,
      index: index + 1,
    }));
  });
}
const stop = new Set([
  "什么",
  "怎么",
  "如何",
  "是否",
  "一下",
  "请问",
  "我们",
  "这个",
  "那个",
  "为什么",
  "可以",
  "哪些",
  "the",
  "is",
  "and",
  "what",
  "how",
]);
export function terms(text: string) {
  const result: string[] = [];
  for (const part of text
    .toLowerCase()
    .match(/[a-z][a-z0-9_]+|\d+(?:\.\d+)?|[\u3400-\u9fff]+/g) || []) {
    if (/^[\u3400-\u9fff]+$/.test(part)) {
      if (part.length === 1) continue;
      for (let i = 0; i < part.length - 1; i++)
        if (!stop.has(part.slice(i, i + 2))) result.push(part.slice(i, i + 2));
    } else if (!stop.has(part)) result.push(part);
  }
  return result;
}
/** Sparse TF-IDF cosine + lexical coverage. Runs locally; no neural embedding or model downloads. */
export function retrieveKnowledge(
  question: string,
  documents: KnowledgeDocument[],
  limit = 4,
): KnowledgeHit[] {
  const snippets = splitDocuments(documents),
    query = [...new Set(terms(question))];
  if (!query.length || !snippets.length) return [];
  const bags = snippets.map((s) => terms(s.title + " " + s.text)),
    df = new Map<string, number>();
  for (const bag of bags)
    for (const t of new Set(bag)) df.set(t, (df.get(t) || 0) + 1);
  const idf = (t: string) =>
    Math.log(1 + (snippets.length + 1) / ((df.get(t) || 0) + 1));
  function vector(tokens: string[]) {
    const v = new Map<string, number>();
    for (const t of tokens) v.set(t, (v.get(t) || 0) + 1);
    for (const [t, n] of v) v.set(t, (1 + Math.log(n)) * idf(t));
    return v;
  }
  const qv = vector(query),
    norm = (v: Map<string, number>) => Math.hypot(...v.values()),
    qn = norm(qv);
  return snippets
    .map((s, i) => {
      const v = vector(bags[i]),
        matches = query.filter((t) => v.has(t)),
        coverage = matches.length / query.length;
      const cosine =
        matches.reduce((n, t) => n + (qv.get(t) || 0) * (v.get(t) || 0), 0) /
        (qn * norm(v) || 1);
      return { ...s, coverage, score: 0.8 * cosine + 0.2 * coverage };
    })
    .filter((h) => h.coverage >= 0.18 && h.score >= 0.1)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.min(4, Math.max(1, limit)));
}
export function sourceQuotes(snippet: Snippet): string[] {
  const result: string[] = [];
  for (const paragraph of snippet.text.split(/(?<=[。！？.!?])|\n+/)) {
    const part = paragraph.trim();
    for (let i = 0; i < part.length; i += 300) {
      const quote = part.slice(i, i + 300).trim();
      if (quote.length >= 4) result.push(quote);
    }
  }
  return result;
}
export const knowledgeAnswerSchema = z
  .object({
    status: z.enum(["answered", "insufficient", "conflict"]),
    answer: z.string().trim().min(1).max(1200),
    citations: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            quote: z.string().min(4).max(350),
            quoteIndex: z.number().int().nonnegative().optional(),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();
export function validateKnowledgeAnswer(value: unknown, snippets: Snippet[]) {
  const a = knowledgeAnswerSchema.parse(value);
  if (a.status === "answered" && !a.citations.length)
    throw new Error("回答缺少引用。");
  if (a.status === "conflict" && new Set(a.citations.map((c) => c.id)).size < 2)
    throw new Error("冲突回答需至少两处依据。");
  const ids = new Set<string>();
  for (const c of a.citations) {
    const s = snippets.find((s) => s.id === c.id);
    const reference = JSON.stringify([c.id, c.quote]);
    if (
      !s ||
      ids.has(reference) ||
      !s.text.includes(c.quote) ||
      (c.quoteIndex !== undefined && sourceQuotes(s)[c.quoteIndex] !== c.quote)
    )
      throw new Error("模型引用不属于检索原文或引用重复。");
    ids.add(reference);
  }
  return a;
}
export const starterKnowledge: KnowledgeDocument[] = [
  {
    id: "demo-definitions",
    title: "课程示例：指标与核查规则",
    version: "2026-10-25",
    source: "DataPilot 教学示例，需按实际业务修改",
    text: "利润率定义\n本示例的总体利润率为有效完整记录的利润合计除以销售额合计，再乘以100%。不使用每行利润率的算术平均。利润或销售额缺失的记录成对排除，销售额分母为零时不计算。\n\n客单价定义\n本示例的客单价为有效记录的销售额合计除以订单编号的去重数量。同一订单有多行时，金额按行合计，订单按标识去重。订单标识缺失或金额缺失的记录不参与计算。订单编号应按文本导入，保留前导零。\n\n周期变化与原因核查\n周期增减等于本期合计减去基期合计。每个分组的增减贡献也采用同样的差额，两期分组贡献的合计等于总体增减。分组贡献只描述统计变化，不能证明业务因果。两个周期天数、数据缺失、极端记录、退款和口径变动均需核查。\n\n退款处理\n当前教学数据没有退款标记，无法判断是否应剔除退款。实际收入是否扣除退款须依据团队提供的正式业务定义，并确认表中存在对应字段。缺少依据时应回答无法确定。",
  },
];
