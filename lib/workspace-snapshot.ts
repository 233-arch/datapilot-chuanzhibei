import { type Dataset, type Profile, type Plan, type AnalysisResult, type FilterClause, LIMITS, defaultPlan, validatePlan, validateFilters, executePlan } from "./data-engine";
import { type Dictionary, validateDictionary, enrichProfile } from "./workspace-kit";
import { type PinnedInsight } from "./exploration";
import { type JourneyState, restoreJourney } from "./copilot";
import { type WorkspaceTools, restoreTools } from "./workspace-tools";
import { type WorkspaceTab } from "./workspace-navigation";
import { restoreDraft, type ReportDraft } from "./report-draft";

export type WorkspaceEntry = {
  id: string; question: string; plan: Plan; result: AnalysisResult;
  mode: "model" | "demo"; retrieved: string[]; origin?: "model" | "demo" | "navigator";
};
export type WorkspaceSnapshot = {
  dataset: Dataset; entries: WorkspaceEntry[]; pins: PinnedInsight[];
  filters: FilterClause[]; plan: Plan; dictionary: Dictionary;
  journey: JourneyState; tools: WorkspaceTools; tab: WorkspaceTab; reportDraft?: ReportDraft;
};
export type LibraryItem = {
  id: string; name: string; rows: number; columns: number; source: Dataset["source"];
  savedAt: string; analyses: number; pins: number; rules: number;
};
export const LIBRARY_LIMIT = 8;
export function updateLibraryIndex(items: LibraryItem[], item: LibraryItem): LibraryItem[] {
  if (!items.some(i => i.id === item.id) && items.length >= LIBRARY_LIMIT)
    throw new Error(`本机数据集库已满（${LIBRARY_LIMIT} 份）。请先在“我的数据集”移除不需要的副本，再继续。`);
  return [item, ...items.filter(i => i.id !== item.id)];
}

// Only these workspace fields are persisted. API credentials never belong here.
export function snapshotFields(value: WorkspaceSnapshot): WorkspaceSnapshot {
  const { dataset, entries, pins, filters, plan, dictionary, journey, tools, tab } = value;
  return { dataset, entries, pins, filters, plan, dictionary, journey, tools, tab, reportDraft: restoreDraft(value.reportDraft) };
}
export function libraryItem(value: WorkspaceSnapshot): LibraryItem {
  return { id: value.dataset.id, name: value.dataset.name, rows: value.dataset.rows.length,
    columns: value.dataset.columns.length, source: value.dataset.source,
    savedAt: new Date().toISOString(), analyses: value.entries.length, pins: value.pins.length,
    rules: value.tools.rules?.length || 0 };
}
export function validateStoredDataset(value: unknown): Dataset {
  const d = value as Dataset | null;
  if (!d || typeof d.id !== "string" || !d.id || typeof d.name !== "string" ||
    !Array.isArray(d.columns) || !d.columns.length || d.columns.length > LIMITS.columns ||
    d.columns.some(c => typeof c !== "string" || !c || ["__proto__", "constructor", "prototype"].includes(c)) ||
    new Set(d.columns).size !== d.columns.length || !Array.isArray(d.rows) ||
    !d.rows.length || d.rows.length > LIMITS.rows ||
    d.rows.some(row => !row || typeof row !== "object" || d.columns.some(c => {
      const cell = row[c];
      return cell !== null && typeof cell !== "string" && !(typeof cell === "number" && Number.isFinite(cell));
    }))) throw new Error("这份本机副本的数据不完整，无法打开。当前工作保持不变。");
  return d;
}
export function restoreSnapshot(value: Partial<WorkspaceSnapshot>, profile: Profile): WorkspaceSnapshot {
  const dataset = validateStoredDataset(value.dataset);
  let dictionary: Dictionary = {}, filters: FilterClause[] = [], plan = defaultPlan(profile);
  try { dictionary = validateDictionary(value.dictionary || {}, dataset.columns); } catch {}
  profile = enrichProfile(profile, dictionary);
  try { validateFilters(value.filters || [], profile.fields); filters = value.filters || []; } catch {}
  try { if (value.plan) { validatePlan(value.plan, profile); plan = { ...value.plan, filter: undefined, filters: undefined }; } } catch {}
  const pins = (Array.isArray(value.pins) ? value.pins : []).filter(pin => {
    try { validatePlan(pin.plan, profile); return typeof pin.id === "string" && typeof pin.name === "string" && typeof pin.note === "string"; } catch { return false; }
  }).slice(0, 12);
  const entries = (Array.isArray(value.entries) ? value.entries : []).slice(-30).flatMap(entry => {
    try {
      validatePlan(entry.plan, profile);
      if (typeof entry.id !== "string" || typeof entry.question !== "string") return [];
      return [{ id: entry.id, question: entry.question, plan: entry.plan, result: executePlan(dataset, profile, entry.plan),
        mode: entry.mode === "model" ? "model" as const : "demo" as const,
        retrieved: Array.isArray(entry.retrieved) ? entry.retrieved.filter(v => typeof v === "string") : [],
        origin: entry.origin }];
    } catch { return []; }
  });
  const tabs: WorkspaceTab[] = ["overview", "charts", "preview", "quality", "lab", "diagnostics", "intelligence"];
  return { dataset, dictionary, filters, plan, entries, pins,
    journey: restoreJourney(value.journey, dataset.id, profile), tools: restoreTools(value.tools, dataset, profile),
    tab: tabs.includes(value.tab!) ? value.tab! : "overview", reportDraft: restoreDraft(value.reportDraft) };
}
