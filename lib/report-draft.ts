import type { Dataset } from "./data-engine";
import type { ReportAnalysis } from "./report-bundle";

export type ReportNote = { finding: string; evidence: string; recommendation: string };
export type ReportDraft = { title: string; omitted: string[]; order: string[]; notes: Record<string, ReportNote>; reviewedBasis: string; reviewedAt: string; updatedAt: string };
export const emptyDraft = (): ReportDraft => ({ title: "", omitted: [], order: [], notes: {}, reviewedBasis: "", reviewedAt: "", updatedAt: "" });
export function restoreDraft(value: unknown): ReportDraft {
  if (!value || typeof value !== "object") return emptyDraft();
  const d = value as Partial<ReportDraft>, text = (v: unknown, max: number) => typeof v === "string" ? v.slice(0, max) : "";
  const keys = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && s.length < 20000))].slice(0, 100) : [];
  const notes: Record<string, ReportNote> = {};
  if (d.notes && typeof d.notes === "object") for (const [key, note] of Object.entries(d.notes).slice(0, 100)) {
    if (key.length >= 20000 || ["__proto__", "constructor", "prototype"].includes(key) || !note || typeof note !== "object") continue;
    notes[key] = { finding: text(note.finding, 1500), evidence: text(note.evidence, 1500), recommendation: text(note.recommendation, 1500) };
  }
  return { title: text(d.title, 120), omitted: keys(d.omitted), order: keys(d.order), notes,
    reviewedBasis: text(d.reviewedBasis, 120), reviewedAt: text(d.reviewedAt, 40), updatedAt: text(d.updatedAt, 40) };
}
// A change marker, not an integrity/security digest. Backups use SHA-256 separately.
export function changeMarker(text: string): string {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c; }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${text.length}`;
}
const fingerprints = new WeakMap<Dataset, string>();
export function datasetMarker(dataset: Dataset): string {
  let marker = fingerprints.get(dataset);
  if (!marker) { marker = changeMarker(JSON.stringify([dataset.columns, dataset.rows, dataset.types])); fingerprints.set(dataset, marker); }
  return marker;
}
export function orderReportItems(items: ReportAnalysis[], order: string[]): ReportAnalysis[] {
  const ranks = new Map(order.map((key, i) => [key, i]));
  return [...items].sort((a, b) => (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity));
}
export function draftAnalyses(items: ReportAnalysis[], draft: ReportDraft): ReportAnalysis[] {
  return orderReportItems(items, draft.order).map(item => {
    const n = draft.notes[item.key];
    const note = [item.note, n?.finding && `发现：${n.finding}`, n?.evidence && `证据：${n.evidence}`, n?.recommendation && `建议：${n.recommendation}`].filter(Boolean).join("\n");
    return { ...item, note };
  });
}
