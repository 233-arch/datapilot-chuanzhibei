"use client";
import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type ComponentProps,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Hash,
  History,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  TrendingUp,
  Upload,
  UploadCloud,
  WandSparkles,
  X,
  Braces,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  MousePointer2,
  Bookmark,
  FlaskConical,
  FileSearch,
} from "lucide-react";
import { ChartConfiguration, ChartStudioHeader } from "@/components/exploration/chart-configuration";
import { ContextAssistant } from "@/components/exploration/context-assistant";
import { contextActions, type ContextAction } from "@/lib/context-actions";
import { AnalysisTemplates } from "@/components/exploration/analysis-templates";
import { buildTemplate, templatePins, type TemplateId, type TemplateMapping } from "@/lib/analysis-templates";
import { DataChart } from "@/components/exploration/data-chart";
import { DataPreview, defaultPreviewView, type PreviewView } from "@/components/exploration/data-preview";
import { QualityAudit } from "@/components/exploration/quality-audit";
import { BusinessRules } from "@/components/exploration/business-rules";
import { ProjectBackup, downloadProject } from "@/components/exploration/project-backup";
import { ReportPresentation } from "@/components/exploration/report-presentation";
import { emptyDraft, restoreDraft, draftAnalyses, orderReportItems, datasetMarker, changeMarker, type ReportDraft } from "@/lib/report-draft";
import { importedSnapshot, type BackupPreview } from "@/lib/workspace-backup";
import { useWorkspaceAutosave } from "@/hooks/use-workspace-autosave";
import { ReportCenter } from "@/components/exploration/report-center";
import { PanelBoundary } from "@/components/exploration/panel-boundary";
import { collectReportAnalyses, selectReportAnalyses, markdownReport } from "@/lib/report-bundle";
import { previewCleaning } from "@/lib/quality-audit";
import { PageNavigation, PageSwitcher, WorkspaceHome, NextPages } from "@/components/exploration/page-navigation";
import { useWorkspaceNavigation } from "@/hooks/use-workspace-navigation";
import { useRecentPages } from "@/hooks/use-recent-pages";
import { workspacePages, stateFromPage, type WorkspacePage, type WorkspaceTab, type WorkspaceView } from "@/lib/workspace-navigation";
import { AnalysisLaunch } from "@/components/exploration/analysis-launch";
import { AnalysisCollection } from "@/components/exploration/analysis-collection";
import { WorkspaceSearch, type WorkspaceAction } from "@/components/exploration/workspace-search";
import {
  type Dataset,
  type Profile,
  type Plan,
  type AnalysisResult,
  makeDemo,
  parseCSV,
  profileDataset,
  defaultPlan,
  executePlan,
  formatNumber,
  numeric,
  toCSV,
  reportMarkdown,
  FILE_SIZE_LABEL,
  validateImportFileSize,
  type FilterClause,
  mergeFilters,
  filtersForPlan,
  filterDataset,
  groupFilter,
  validateFilters,
  validatePlan,
} from "@/lib/data-engine";
import {
  clarifyQuestion,
  analysisFacts,
  type Clarification,
  rangeFilters,
} from "@/lib/diagnostics";
import { EvidenceGuide } from "@/components/exploration/evidence-guide";
import { VisitorApiSettings } from "@/components/exploration/visitor-api";
import { useVisitorModel, visitorModelHeaders } from "@/lib/visitor-model";
import { qualityStatus, starterQuestions } from "@/lib/workspace-presentation";
import { localAssistant, type LocalReply, type LocalAction } from "@/lib/local-assistant";
import { backgroundTask } from "@/lib/background";
import { campusScenario } from "@/lib/scenarios";
import {
  type WorkspaceTools,
  defaultTools,
  restoreTools,
} from "@/lib/workspace-tools";
const LazyIntelligence = lazy(() =>
  import("@/components/exploration/intelligence").then((m) => ({
    default: m.IntelligenceWorkspace,
  })),
);
const LazyDiagnostics = lazy(() =>
  import("@/components/exploration/diagnostics").then((m) => ({
    default: m.Diagnostics,
  })),
);
const LazyImportWizard = lazy(() =>
  import("@/components/exploration/import-wizard").then((m) => ({
    default: m.ImportWizard,
  })),
);
import { readWorkspace, writeWorkspace, listLibrary, readLibraryWorkspace, saveLibraryWorkspace, deleteLibraryWorkspace } from "@/lib/local-store";
import { restoreSnapshot, validateStoredDataset, type WorkspaceSnapshot, type LibraryItem } from "@/lib/workspace-snapshot";
import { DatasetLibrary } from "@/components/exploration/dataset-library";
import {
  explorationTasks,
  proposeAnalysis,
  planKey,
  recordJourney,
  restoreJourney,
  type JourneyState,
  type ExplorationTask,
} from "@/lib/copilot";
import {
  ExplorationNavigator,
  PlanReview,
  AnalysisJourney,
} from "@/components/exploration/copilot";
import { type PinnedInsight, evidenceRows } from "@/lib/exploration";
import { FilterBar } from "@/components/exploration/filter-bar";
import {
  type Dictionary,
  enrichProfile,
  validateDictionary,
  drillPlan,
  exportRecipe,
  importRecipe,
  reportHTML,
} from "@/lib/workspace-kit";
import {
  EvidenceView,
  type EvidenceSelection,
} from "@/components/exploration/evidence";
const LazyLab = lazy(() =>
  import("@/components/exploration/lab").then((m) => ({
    default: m.ExplorationLab,
  })),
);
const LazyDictionary = lazy(() =>
  import("@/components/exploration/workspace-kit").then((m) => ({
    default: m.DictionaryEditor,
  })),
);
const LazyDelivery = lazy(() =>
  import("@/components/exploration/workspace-kit").then((m) => ({
    default: m.DeliveryCenter,
  })),
);
function ToolLoading() {
  return (
    <div className="kit-callout" role="status">
      <LoaderCircle size={18} className="spin" />
      正在加载分析工具…
    </div>
  );
}
function ExplorationLab(
  props: ComponentProps<
    typeof import("@/components/exploration/lab").ExplorationLab
  >,
) {
  return (
    <Suspense fallback={<ToolLoading />}>
      <LazyLab {...props} />
    </Suspense>
  );
}
function DictionaryEditor(
  props: ComponentProps<
    typeof import("@/components/exploration/workspace-kit").DictionaryEditor
  >,
) {
  return (
    <Suspense fallback={<ToolLoading />}>
      <LazyDictionary {...props} />
    </Suspense>
  );
}
function DeliveryCenter(
  props: ComponentProps<
    typeof import("@/components/exploration/workspace-kit").DeliveryCenter
  >,
) {
  return (
    <Suspense fallback={<ToolLoading />}>
      <LazyDelivery {...props} />
    </Suspense>
  );
}
type Entry = {
  id: string;
  question: string;
  plan: Plan;
  result: AnalysisResult;
  mode: "model" | "demo";
  retrieved: string[];
  origin?: "model" | "demo" | "navigator";
};
type Proposal = Omit<Entry, "id"> & {
  basis: string;
  origin: "model" | "demo" | "navigator";
};
type Tab = WorkspaceTab;
type View = WorkspaceView;

type Dialog =
  | "search"
  | "upload"
  | "help"
  | "settings"
  | "clean"
  | "evidence"
  | "dictionary"
  | "delivery"
  | "report-preview"
  | null;
const initialDataset = makeDemo();
function barePlan(plan: Plan): Plan {
  return { ...plan, filter: undefined, filters: undefined };
}
function download(
  name: string,
  text: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-symbol ${small ? "small" : ""}`}>
      <span />
      <span />
      <span />
      <i />
    </span>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") || panel.current)?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = panel.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${className}`}
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          className="icon-button modal-close"
          aria-label="关闭窗口"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2 id="dialog-title">{title}</h2>
        {subtitle && <p className="muted modal-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
export default function Home() {
  const [dataset, setDataset] = useState<Dataset>(initialDataset);
  const [tools, setTools] = useState<WorkspaceTools>(() =>
    defaultTools(initialDataset, profileDataset(initialDataset)),
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [scopeFilters, setScopeFilters] = useState<FilterClause[]>([]);
  const [pins, setPins] = useState<PinnedInsight[]>([]);
  const [dictionary, setDictionary] = useState<Dictionary>({});
  const [reportPreview, setReportPreview] = useState("");
  const [reportDraft, setReportDraft] = useState<ReportDraft>(emptyDraft);
  const [presenting, setPresenting] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [configUndo, setConfigUndo] = useState<{ before: WorkspaceSnapshot; after: string; label: string } | null>(null);
  const [evidence, setEvidence] = useState<EvidenceSelection | null>(null);
  const [evidenceFilter, setEvidenceFilter] = useState<FilterClause | null>(
    null,
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [clarification, setClarification] = useState<Clarification | null>(
    null,
  );
  const [preparedProfile, setPreparedProfile] = useState<{
    id: string;
    profile: Profile;
  } | null>(null);
  const [view, setView] = useState<View>("workspace");
  const [tab, setTab] = useState<Tab>("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activePlan, setActivePlan] = useState<Plan>(() =>
    defaultPlan(profileDataset(initialDataset)),
  );
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const visitorModel = useVisitorModel();
  const mode = visitorModel ? "model" : "demo";
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [assistant, setAssistant] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [assistantTab, setAssistantTab] = useState<"chat" | "navigator">(
    "chat",
  );
  const [previewFirst, setPreviewFirst] = useState(true);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [localReply, setLocalReply] = useState<{ question: string; reply: LocalReply } | null>(null);
  const [journey, setJourney] = useState<JourneyState>({
    datasetId: initialDataset.id,
    steps: [],
    cursor: -1,
  });
  const [replaying, setReplaying] = useState(false);
  const [showSQL, setShowSQL] = useState(false);
  const [chartSettingsOpen, setChartSettingsOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [storageError, setStorageError] = useState<"read" | "write" | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [libraryOperation, setLibraryOperation] = useState("");
  const [removedCopy, setRemovedCopy] = useState<WorkspaceSnapshot | null>(null);
  const libraryLock = useRef(false);
  const currentPage = useWorkspaceNavigation(ready, view, tab, setView, setTab);
  const recentPages = useRecentPages(ready, currentPage);
  const [previewView, setPreviewView] = useState<{ datasetId: string; value: PreviewView }>(() => ({ datasetId: initialDataset.id, value: defaultPreviewView() }));
  const pageInfo = workspacePages.find(page => page.id === currentPage)!;
  const [drag, setDrag] = useState(false);
  const [cleanOptions, setCleanOptions] = useState({
    deduplicate: true,
    trim: true,
    fillMissing: false,
  });
  const [undo, setUndo] = useState<Dataset | null>(null);
  const [undoEntries, setUndoEntries] = useState<Entry[]>([]);
  const [undoPins, setUndoPins] = useState<PinnedInsight[]>([]);
  const [undoFilters, setUndoFilters] = useState<FilterClause[]>([]);
  const [undoTools, setUndoTools] = useState<WorkspaceTools | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const chatBottom = useRef<HTMLDivElement>(null);
  const chatScroll = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const restoredPlan = useRef<string | null>(null);
  const profile = useMemo(
    () =>
      enrichProfile(
        preparedProfile?.id === dataset.id
          ? preparedProfile.profile
          : profileDataset(dataset),
        dictionary,
      ),
    [dataset, dictionary, preparedProfile],
  );
  const scopeDataset = useMemo(
    () => filterDataset(dataset, scopeFilters, profile),
    [dataset, scopeFilters, profile],
  );
  const scopedPlan = useMemo(
    () => ({ ...activePlan, filters: scopeFilters, filter: undefined }),
    [activePlan, scopeFilters],
  );
  const reportItems = useMemo(() => orderReportItems(collectReportAnalyses(scopedPlan, pins, entries), reportDraft.order), [scopedPlan, pins, entries, reportDraft.order]);
  const selectedReports = draftAnalyses(selectReportAnalyses(reportItems, reportDraft.omitted), reportDraft);
  const reportBasis = changeMarker(JSON.stringify([datasetMarker(dataset), dictionary, tools.rules, reportDraft.title, selectedReports.map(item => [item.key, item.note])]));
  const reportMeta = { title: reportDraft.title, version: datasetMarker(dataset), review: reportDraft.reviewedAt && reportDraft.reviewedBasis === reportBasis ? "已人工核验" : "待人工核验" };
  function updateDraft(patch: Partial<ReportDraft>) { setReportDraft(previous => ({ ...previous, ...patch, updatedAt: new Date().toISOString() })); }
  function toggleReport(key: string) {
    // Preserve explicit selection even when the catalogue is over the report limit.
    const included = new Set(selectedReports.map(item => item.key));
    if (included.has(key)) included.delete(key); else included.add(key);
    updateDraft({ omitted: reportItems.filter(item => !included.has(item.key)).map(item => item.key) });
  }
  const result = useMemo(() => {
    try {
      return executePlan(dataset, profile, scopedPlan);
    } catch {
      return executePlan(dataset, profile, {
        ...defaultPlan(profile),
        filters: scopeFilters,
      });
    }
  }, [dataset, profile, scopedPlan]);
  const proposalBasis = useMemo(
    () => JSON.stringify({ id: dataset.id, plan: scopedPlan, dictionary }),
    [dataset.id, scopedPlan, dictionary],
  );
  const navigationTasks = useMemo(
    () => explorationTasks(dataset, profile, scopedPlan),
    [dataset, profile, scopedPlan],
  );
  const quality = qualityStatus(profile);
  const cleanPreview = useMemo(() => dialog === "clean" ? previewCleaning(dataset, cleanOptions) : null, [dialog, dataset, cleanOptions]);

  const dimensions = profile.fields.filter((f) => f.type !== "number");
  const metrics = profile.fields.filter((f) => f.type === "number");
  const secondaryPlan = useMemo(() => {
    const field =
      dimensions.find(
        (f) =>
          f.type === "text" && /地区|区域|region|类别|category/i.test(f.name),
      ) ||
      dimensions.find((f) => f.type === "text" && f.unique < 30) ||
      dimensions[0] ||
      profile.fields[0];
    return {
      ...defaultPlan(profile),
      title: `${field.name}分布`,
      groupBy: field.name,
      chart: "bar" as const,
      sort: "desc" as const,
      limit: 5,
    };
  }, [profile]);
  const secondary = useMemo(
    () =>
      executePlan(dataset, profile, {
        ...secondaryPlan,
        filters: scopeFilters,
      }),
    [dataset, profile, secondaryPlan, scopeFilters],
  );
  const categoryPlan = useMemo(() => {
    const field =
      dimensions.find(
        (f) => f.type === "text" && /类别|category|类型|渠道/.test(f.name),
      ) ||
      dimensions.find(
        (f) =>
          f.name !== secondaryPlan.groupBy &&
          f.type === "text" &&
          f.unique < 20,
      ) ||
      dimensions.find((f) => f.type === "text" && f.unique < 30) ||
      dimensions[0] ||
      profile.fields[0];
    return {
      ...defaultPlan(profile),
      title: `${field.name}构成`,
      groupBy: field.name,
      chart: "pie" as const,
      sort: "desc" as const,
      limit: 6,
    };
  }, [profile, secondaryPlan.groupBy]);
  const category = useMemo(
    () =>
      executePlan(dataset, profile, { ...categoryPlan, filters: scopeFilters }),
    [dataset, profile, categoryPlan, scopeFilters],
  );
  const metricSparkPath = useMemo(() => {
    const values = executePlan(dataset, profile, {
      ...defaultPlan(profile),
      filters: scopeFilters,
    }).points.map((p) => p.value);
    const min = Math.min(...values),
      max = Math.max(...values);
    return values
      .map(
        (v, i) =>
          (i ? "L" : "M") +
          ((100 * i) / Math.max(1, values.length - 1)).toFixed(1) +
          " " +
          (25 - (22 * (v - min)) / Math.max(1, max - min)).toFixed(1),
      )
      .join(" ");
  }, [dataset, profile, scopeFilters]);
  const sumField = (field?: string) =>
    field
      ? scopeDataset.rows.reduce((sum, r) => sum + (numeric(r[field]) ?? 0), 0)
      : 0;
  const primaryMetric =
    metrics.find((f) => /销售额|收入|sales|revenue/i.test(f.name)) ||
    metrics[0];
  const profitMetric =
    metrics.find((f) => /利润|profit/i.test(f.name)) || metrics[1];
  const starters = useMemo(() => starterQuestions(profile), [profile]);
  useEffect(() => {
    let alive = true;
    setReady(false);
    setStorageError(null);
    readWorkspace<WorkspaceSnapshot>()
      .then(async (value) => {
        if (!alive || !value) return;
        const restoredDataset = validateStoredDataset(value.dataset);
        const p = await backgroundTask<Profile>("profile", restoredDataset);
        if (!alive) return;
        const restored = restoreSnapshot(value, p);
        applySnapshot(restored, p);
      })
      .then(() => { if (alive) setReady(true); })
      .catch(() => { if (alive) setStorageError("read"); });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [restoreAttempt]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!ready) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !event.isComposing) {
        if (dialog && dialog !== "search") return;
        if (pendingFile || (dialog !== "search" && document.querySelector('dialog[open], [aria-modal="true"]'))) return;
        event.preventDefault();
        setMobileChat(false);
        setDialog(current => current === "search" ? null : "search");
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [dialog, ready, pendingFile]);
  useEffect(() => {
    const open = () => {
      setMobileChat(false);
      setDialog("settings");
    };
    window.addEventListener("datapilot:configure-api", open);
    return () => window.removeEventListener("datapilot:configure-api", open);
  }, []);
  useEffect(() => {
    if (!assistant || !mobileChat || dialog) return;
    input.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAssistant(false);
        setMobileChat(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [assistant, mobileChat, dialog]);
  useEffect(() => {
    requestGeneration.current++;
    abort.current?.abort();
    setBusy(false);
    setSteps([]);
    setProposal(null);
    setLocalReply(null);
  }, [visitorModel]);
  useEffect(() => { setLocalReply(null); }, [proposalBasis]);
  const persistenceSnapshot = useMemo(() => ({ dataset, entries, pins, filters: scopeFilters, plan: activePlan, dictionary, journey, tools, tab, reportDraft }), [dataset, entries, pins, scopeFilters, activePlan, dictionary, journey, tools, tab, reportDraft]);
  const onSaveState = useCallback((complete: boolean, error?: unknown) => {
    setSaved(complete); setStorageError(error ? "write" : null);
    setSaveMessage(error ? storageMessage(error) : "");
  }, []);
  useWorkspaceAutosave(persistenceSnapshot, ready, saveAttempt, libraryLock, onSaveState);
  useEffect(() => {
    if (tools.datasetId !== dataset.id)
      setTools(defaultTools(dataset, profile));
  }, [dataset.id, tools.datasetId, profile]);
  useEffect(() => {
    if (!ready) return;
    setProposal(null);
    const key = planKey(scopedPlan);
    if (restoredPlan.current === key) {
      restoredPlan.current = null;
      return;
    }
    restoredPlan.current = null;
    setReplaying(false);
    setJourney((previous) =>
      recordJourney(
        previous,
        dataset.id,
        scopedPlan,
        profile,
        crypto.randomUUID(),
        new Date().toISOString(),
      ),
    );
  }, [ready, scopedPlan, dataset.id]);
  useEffect(() => {
    setProposal(null);
  }, [proposalBasis]);
  useEffect(() => {
    if (assistantTab === "navigator")
      chatScroll.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [assistantTab]);
  useEffect(() => {
    if (!replaying) return;
    if (journey.cursor >= journey.steps.length - 1) {
      setReplaying(false);
      return;
    }
    const timer = setTimeout(() => restoreStep(journey.cursor + 1, true), 2400);
    return () => clearTimeout(timer);
  }, [replaying, journey]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    chatBottom.current?.scrollIntoView({
      behavior: proposal ? "auto" : "smooth",
      block: "nearest",
    });
  }, [entries, busy, steps, proposal, localReply]);
  function activateDataset(next: Dataset, prepared?: Profile) {
    setPreparedProfile(prepared ? { id: next.id, profile: prepared } : null);
    setClarification(null);
    setPendingFile(null);
    setEvidenceFilter(null);
    setQuestion("");
    setLocalReply(null);
    setReportPreview("");
    setReportDraft(emptyDraft()); setPresenting(false);
    setPreviewView({ datasetId: next.id, value: defaultPreviewView() });
    requestGeneration.current++;
    abort.current?.abort();
    setBusy(false);
    setSteps([]);
    setProposal(null);
    setReplaying(false);
    setDataset(next);
    setTools(defaultTools(next, prepared || profileDataset(next)));
    setActivePlan(defaultPlan(prepared || profileDataset(next)));
    setEntries([]);
    setScopeFilters([]);
    setPins([]);
    setDictionary({});
    setEvidence(null);
    setUndoPins([]);
    setUndoFilters([]);
    setUndo(null);
    setUndoTools(null);
    setUndoEntries([]);
    setTab("overview");
    setView("workspace");
    setDialog(null);
    setError("");
    setToast(`已载入 ${next.rows.length.toLocaleString()} 条记录`);
  }
  function currentSnapshot(): WorkspaceSnapshot {
    return { dataset, entries, pins, filters: scopeFilters, plan: activePlan, dictionary, journey, tools, tab, reportDraft };
  }
  function applySnapshot(value: WorkspaceSnapshot, p: Profile) {
    setPreparedProfile({ id: value.dataset.id, profile: p });
    setDataset(value.dataset); setTools(value.tools); setEntries(value.entries);
    setPins(value.pins); setScopeFilters(value.filters); setActivePlan(value.plan);
    setDictionary(value.dictionary); setJourney(value.journey); setTab(value.tab);
    setReportDraft(restoreDraft(value.reportDraft)); setPresenting(false);
  }
  async function restoreProject(preview: BackupPreview) {
    await libraryAction("正在恢复项目备份…", async () => {
      const next = importedSnapshot(preview.snapshot);
      const p = await backgroundTask<Profile>("profile", next.dataset);
      await saveLibraryWorkspace(currentSnapshot(), next);
      activateDataset(next.dataset, p); applySnapshot(next, p);
      setView("datasets"); setToast("备份已恢复为独立项目；上一份工作已保留");
    }, true);
  }
  async function exportProject() {
    try { await downloadProject(currentSnapshot()); setToast("已生成当前项目备份"); }
    catch (e) { setError(storageMessage(e)); }
  }
  async function refreshLibrary() {
    setLibraryLoading(true);
    try { setLibrary(await listLibrary()); setLibraryError(""); }
    catch (error) { setLibraryError(storageMessage(error)); }
    finally { setLibraryLoading(false); }
  }
  useEffect(() => { if (ready && view === "datasets") void refreshLibrary(); }, [ready, view]);
  function storageMessage(error: unknown) {
    if ((error as Error)?.name === "QuotaExceededError") return "浏览器存储空间不足，操作未完成。请导出重要数据，并移除不需要的本机副本后重试。";
    return error instanceof Error ? error.message : "本机存储暂时不可用，请重试。";
  }
  async function libraryAction(label: string, action: () => Promise<void>, propagate = false) {
    if (libraryLock.current) return;
    libraryLock.current = true; setLibraryOperation(label); setLibraryError("");
    try { await action(); await refreshLibrary(); }
    catch (error) { const message = storageMessage(error); setLibraryError(message); setError(message); if (propagate) throw new Error(message); }
    finally { libraryLock.current = false; setLibraryOperation(""); setSaveAttempt(n => n + 1); }
  }
  async function saveCurrentCopy() {
    await libraryAction("正在保存工作副本…", async () => {
      await saveLibraryWorkspace(currentSnapshot()); setToast("已保存数据及分析配置到本机数据集库");
    });
  }
  async function openLibraryCopy(id: string) {
    if (id === dataset.id) { navigatePage("charts"); return; }
    await libraryAction("正在保存当前工作并打开数据…", async () => {
      const copy = await readLibraryWorkspace(id);
      if (!copy) throw new Error("这份副本已不存在，请重新读取数据集库。");
      const next = validateStoredDataset(copy.dataset);
      if (next.id !== id) throw new Error("副本信息与索引不一致，当前工作保持不变。请重新读取数据集库。");
      const p = await backgroundTask<Profile>("profile", next);
      const restored = restoreSnapshot(copy, p);
      await saveLibraryWorkspace(currentSnapshot(), restored);
      activateDataset(next, p); applySnapshot(restored, p);
      setToast("已恢复数据、筛选、收藏与分析配置；上一份工作已保留");
    });
  }
  async function removeLibraryCopy(id: string) {
    await libraryAction("正在移除库中副本…", async () => {
      const copy = await readLibraryWorkspace(id);
      await deleteLibraryWorkspace(id); setRemovedCopy(copy);
    });
  }
  async function undoRemoveCopy() {
    if (!removedCopy) return;
    await libraryAction("正在恢复移除的副本…", async () => {
      await saveLibraryWorkspace(removedCopy); setRemovedCopy(null); setToast("已撤销移除，副本已回到数据集库");
    });
  }
  async function setNewDataset(next: Dataset, prepared?: Profile, targetTab: Tab = "overview") {
    await libraryAction("正在保留当前工作并切换数据…", async () => {
      const p = prepared || await backgroundTask<Profile>("profile", next);
      const target = restoreSnapshot({ dataset: next, tab: targetTab }, p);
      await saveLibraryWorkspace(currentSnapshot(), target);
      activateDataset(next, p); applySnapshot(target, p);
      setToast("已载入新数据；上一份工作已保存到“我的数据集”");
    }, true);
  }
  async function uploadFile(file?: File) {
    if (!file) return;
    try { validateImportFileSize(file.size); }
    catch (error) {
      setError((error as Error).message);
      return;
    }
    if (!/\.(csv|tsv|xlsx)$/i.test(file.name)) {
      setError("请上传 CSV、TSV 或 XLSX 文件。旧版 XLS 请另存为 XLSX。");
      return;
    }
    setError("");
    setPendingFile(file);
    setDialog(null);
    if (fileInput.current) fileInput.current.value = "";
  }
  function applyChartRange(start: string, end: string) {
    try {
      const first = start.length === 7 ? start + "-01" : start;
      const last =
        end.length === 7
          ? new Date(
              Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0),
            )
              .toISOString()
              .slice(0, 10)
          : end;
      changeScope(
        mergeFilters(scopeFilters, rangeFilters(scopedPlan, first, last)),
      );
      setToast("时间范围已联动到全部图表，可撤销或重置筛选");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  function exportReport() {
    setDialog("delivery");
  }
  function exportMarkdown() {
    download(
      `${dataset.name.replace(/\.[^.]+$/, "")}_分析报告.md`,
      markdownReport(dataset, profile, selectedReports, dictionary, tools.rules, reportMeta),
      "text/markdown;charset=utf-8",
    );
    setToast("分析报告已导出，包含统计结果与计算口径");
  }
  function printableReport() {
    if (!selectedReports.length) throw new Error("请在洞察报告页至少选择一项分析。");
    return reportHTML(dataset, profile, selectedReports, dictionary, tools.rules, reportMeta);
  }
  function previewReport() {
    try { setReportPreview(printableReport()); setDialog("report-preview"); }
    catch (e) { setToast((e as Error).message); }
  }
  function exportPrintableReport() {
    download(
      `${dataset.name.replace(/\.[^.]+$/, "")}_分析报告.html`,
      printableReport(),
      "text/html;charset=utf-8",
    );
    setToast("HTML 报告已生成，可离线打开并打印为 PDF");
  }
  async function ask(text = question, forcePreview = false) {
    const q = text.trim();
    if (!q || busy) return;
    if (!visitorModel) {
      requestGeneration.current++;
      abort.current?.abort();
      setError(""); setQuestion(""); setClarification(null); setProposal(null);
      setAssistant(true); setMobileChat(true); setAssistantTab("chat");
      setReplaying(false);
      try {
        const answer = localAssistant(q, dataset, profile, scopedPlan);
        if (answer.kind === "reply") setLocalReply({ question: q, reply: answer });
        else {
          setLocalReply(null);
          const next: Proposal = { question: q, plan: answer.plan,
            result: executePlan(dataset, profile, answer.plan), mode: "demo", origin: "demo",
            retrieved: answer.retrieved, basis: proposalBasis };
          if (previewFirst || forcePreview) setProposal(next); else commitProposal(next);
        }
      } catch {
        setLocalReply({ question: q, reply: { kind: "reply", title: "请核对当前数据与口径", lines: ["本地统计未能完成，请调整筛选或换一种明确的问法。"], action: "help" } });
      }
      return;
    }
    setLocalReply(null);
    if (!scopeDataset.rows.length) {
      setError("当前筛选没有记录，请先调整或重置联动筛选。");
      return;
    }
    const needed = clarifyQuestion(q, profile, dataset);
    if (needed) {
      setClarification(needed);
      setAssistant(true);
      setMobileChat(true);
      setAssistantTab("chat");
      return;
    }
    setClarification(null);
    if (
      /环比|同比|周期对比|为什么.*下降|下降.*为什么|变化贡献|拆解变化|拆解.*变化/.test(
        q,
      )
    ) {
      setView("workspace");
      setTab("intelligence");
      setMobileChat(false);
      setTools((previous) => ({
        ...previous,
        workflow: { question: q, plan: null },
      }));
      setQuestion("");
      setToast("已转给多步骤助手。生成计划后请确认指标与周期，再逐步执行。");
      return;
    }
    setQuestion("");
    setError("");
    setBusy(true);
    setReplaying(false);
    setProposal(null);
    setAssistantTab("chat");
    setSteps([]);
    setAssistant(true);
    setMobileChat(true);
    setView("workspace");
    setTab("charts");
    abort.current = new AbortController();
    const generation = ++requestGeneration.current;
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...visitorModelHeaders() },
        body: JSON.stringify({
          question: q,
          previousPlan: scopedPlan,
          profile: {
            ...profile,
            fields: profile.fields.map((f) => ({
              ...f,
              topValues:
                /姓名|邮箱|电话|手机|身份证|email|phone|password|name|id$/i.test(
                  f.name,
                )
                  ? []
                  : f.topValues.map((v) => ({
                      ...v,
                      value: v.value.slice(0, 200),
                    })),
            })),
          },
        }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "服务暂时不可用，请重试。");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("当前浏览器不支持流式响应。");
      const decoder = new TextDecoder();
      let buffer = "",
        received = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const type = chunk.match(/^event: (.+)$/m)?.[1];
          const line = chunk.match(/^data: (.+)$/m)?.[1];
          if (!line) continue;
          const data = JSON.parse(line);
          if (generation !== requestGeneration.current) return;
          if (type === "error") throw new Error(data.error);
          if (type === "step") setSteps((prev) => [...prev, data.label]);
          if (type === "result") {
            const checked = proposeAnalysis(
              dataset,
              profile,
              scopedPlan,
              data.plan,
            );
            const next: Proposal = {
              question: q,
              ...checked,
              mode: data.mode === "model" ? "model" : "demo",
              origin: data.mode === "model" ? "model" : "demo",
              retrieved: data.retrieved,
              basis: proposalBasis,
            };
            if (previewFirst || forcePreview) setProposal(next);
            else commitProposal(next);
            received = true;
          }
        }
        if (done) break;
      }
      if (!received) throw new Error("分析连接中断，请重试。");
    } catch (e) {
      if (generation !== requestGeneration.current) return;
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "分析失败，请重试。");
        setQuestion(q);
      }
    } finally {
      if (generation === requestGeneration.current) {
        setBusy(false);
        setSteps([]);
      }
    }
  }
  function openLocalAction(action: LocalAction) {
    setMobileChat(false);
    if (action === "delivery" || action === "help") setDialog(action);
    else { setView("workspace"); setTab(action); }
  }
  function applyClean() {
    if (!cleanPreview?.changed) return;
    requestGeneration.current++;
    abort.current?.abort();
    setBusy(false);
    setUndo(dataset);
    setUndoEntries(entries);
    setUndoPins(pins);
    setUndoFilters(scopeFilters);
    setUndoTools(tools);
    setPins([]);
    setScopeFilters([]);
    const next = cleanPreview.next;
    setTools({ ...defaultTools(next, profileDataset(next)), rules: tools.rules });
    setPreparedProfile(null);
    setDataset(next);
    setActivePlan(defaultPlan(profileDataset(next)));
    setEntries([]);
    setDialog(null);
    setToast(
      `清洗完成：保留 ${next.rows.length.toLocaleString()} 条记录，可撤销本次操作`,
    );
  }
  function resetDemo() {
    void setNewDataset(makeDemo()).catch(() => undefined);
  }
  function changeScope(filters: FilterClause[]) {
    validateFilters(filters, profile.fields);
    requestGeneration.current++;
    abort.current?.abort();
    setBusy(false);
    setSteps([]);
    setError("");
    setReplaying(false);
    setProposal(null);
    setScopeFilters(filters);
    setClarification(null);
  }
  function updateChartControls(patch: Partial<Plan>) {
    setActivePlan((previous) => {
      const next = { ...previous, ...patch };
      if (next.chart === "pie" && !["sum", "count"].includes(next.aggregate)) next.chart = "bar";
      const labels = { count: "记录数", sum: "合计", mean: "均值", max: "最大值", min: "最小值" };
      const metric = next.aggregate === "count" ? "记录数" : `${next.metric}${labels[next.aggregate]}`;
      const view = next.chart === "pie" ? "构成" : next.chart === "bar" ? "对比" : "趋势";
      return { ...next, title: `${next.groupBy} · ${metric}${view}` };
    });
  }
  function openAnalysis(plan: Plan) {
    validatePlan(plan, profile);
    changeScope(filtersForPlan(plan));
    setActivePlan(barePlan(plan));
    setView("workspace");
    setTab("charts");
  }
  function commitProposal(next: Proposal) {
    if (next.basis !== proposalBasis) {
      setProposal(null);
      setToast("数据或分析口径已变化，请重新生成计划");
      return;
    }
    validatePlan(next.plan, profile);
    const computed = executePlan(dataset, profile, next.plan);
    openAnalysis(next.plan);
    setEntries((previous) =>
      [
        ...previous,
        {
          id: crypto.randomUUID(),
          question: next.question,
          plan: next.plan,
          result: computed,
          mode: next.mode,
          origin: next.origin,
          retrieved: next.retrieved,
        },
      ].slice(-30),
    );
    setProposal(null);
    setToast("已应用分析计划，可在探索路线中回放");
  }
  function previewTask(task: ExplorationTask) {
    try {
      const checked = proposeAnalysis(dataset, profile, scopedPlan, task.plan);
      setProposal({
        ...checked,
        question: task.question,
        mode: "demo",
        origin: "navigator",
        retrieved: [task.plan.groupBy, task.plan.metric].filter(Boolean),
        basis: proposalBasis,
      });
      setAssistant(true);
      setMobileChat(true);
      setAssistantTab("chat");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "无法预览此项建议");
    }
  }
  function restoreStep(index: number, continuePlaying = false) {
    const step = journey.steps[index];
    if (!step || journey.datasetId !== dataset.id) return;
    validatePlan(step.plan, profile);
    requestGeneration.current++;
    abort.current?.abort();
    setBusy(false);
    setSteps([]);
    setProposal(null);
    setError("");
    restoredPlan.current = planKey(step.plan);
    setScopeFilters(filtersForPlan(step.plan));
    setActivePlan(barePlan(step.plan));
    setJourney((previous) => ({ ...previous, cursor: index }));
    setReplaying(continuePlaying);
    setView("workspace");
    setTab("charts");
  }
  function configurationKey(value: WorkspaceSnapshot) {
    return changeMarker(JSON.stringify([value.dataset.id, value.pins, value.filters, value.plan, value.tools.rules, value.reportDraft]));
  }
  function undoConfiguration() {
    if (!configUndo || configurationKey(currentSnapshot()) !== configUndo.after) return;
    const before = configUndo.before;
    changeScope(before.filters); setActivePlan(before.plan); setPins(before.pins); setReportDraft(restoreDraft(before.reportDraft));
    setTools(previous => ({ ...previous, rules: before.tools.rules })); setConfigUndo(null); setToast("已撤销" + configUndo.label);
  }
  function applyTemplate(id: TemplateId, mapping: TemplateMapping) {
    const prepared = buildTemplate(id, mapping, dataset, profile), before = currentSnapshot();
    const additions = templatePins(prepared.plans, "template-" + crypto.randomUUID()).filter(candidate => !pins.some(pin => planKey(pin.plan) === planKey(candidate.plan)));
    const ruleKeys = new Set(tools.rules.map(r => JSON.stringify([r.field, r.kind, r.min, r.max, r.values])));
    const rules = [...tools.rules, ...prepared.rules.filter(r => !ruleKeys.has(JSON.stringify([r.field, r.kind, r.min, r.max, r.values]))).map(r => ({ ...r, id: crypto.randomUUID() }))];
    if (pins.length + additions.length > 12 || rules.length > 12) throw new Error("收藏或规则将超过 12 项，请先整理已有项目再应用模板。");
    const nextPins = [...pins, ...additions], nextPlan = prepared.plans[0];
    const catalog = collectReportAnalyses(nextPlan, nextPins, entries);
    const addedKeys = collectReportAnalyses(nextPlan, prepared.plans.map(plan => ({ plan })), []).map(item => item.key);
    const nextDraft = { ...reportDraft, title: prepared.title, order: [...addedKeys, ...catalog.map(i => i.key).filter(k => !addedKeys.includes(k))], omitted: reportDraft.omitted.filter(k => !addedKeys.includes(k)), updatedAt: new Date().toISOString() };
    changeScope([]); setActivePlan(nextPlan); setPins(nextPins); setTools(previous => ({ ...previous, rules })); setReportDraft(nextDraft);
    setConfigUndo({ before, after: configurationKey({ ...before, pins: nextPins, plan: nextPlan, filters: [], tools: { ...tools, rules }, reportDraft: nextDraft }), label: "模板应用" });
  }
  function runContextAction(action: ContextAction) {
    if (action.page) { navigatePage(action.page); return; }
    if (action.kind === "audit") { setMobileChat(false); setDialog("clean"); return; }
    if (action.id === "report-check") {
      const scopes = new Set(selectedReports.map(item => JSON.stringify(filtersForPlan(item.plan))));
      setLocalReply({ question: action.label, reply: { kind: "reply", title: "报告口径核对", lines: [
        `当前选入 ${selectedReports.length} 项分析，包含 ${scopes.size} 种筛选范围。`,
        scopes.size > 1 ? "章节使用不同筛选范围。请逐项核对，差异不一定是错误。" : "各章节筛选范围一致，仍需核对指标与统计方式。",
        reportDraft.reviewedBasis === reportBasis && reportDraft.reviewedAt ? "当前内容已人工标记核验。" : "当前内容尚未人工核验，或核验后已发生变化。",
      ] } }); return;
    }
    if (action.id === "add-report") {
      const before = currentSnapshot(), key = collectReportAnalyses(scopedPlan, [], [])[0].key;
      const exists = collectReportAnalyses(scopedPlan, pins, []).find(i => i.key === key && i.sources.includes("pin"));
      if (!exists && pins.length >= 12) { setToast("收藏已满，请先整理后加入报告"); return; }
      const nextPins = exists ? pins : [...pins, ...templatePins([scopedPlan], "report-" + crypto.randomUUID()).map(p => ({ ...p, note: "" }))];
      const nextDraft = { ...reportDraft, omitted: reportDraft.omitted.filter(k => k !== key), order: [key, ...reportDraft.order.filter(k => k !== key)], updatedAt: new Date().toISOString() };
      setPins(nextPins); setReportDraft(nextDraft);
      setConfigUndo({ before, after: configurationKey({ ...before, pins: nextPins, reportDraft: nextDraft }), label: "加入报告" });
      setToast("当前图表已加入报告草稿，可撤销"); return;
    }
    if (action.question) { setPreviewFirst(true); void ask(action.question, true); }
  }
  function pinCurrent() {
    if (pins.length >= 12) {
      setToast("最多收藏 12 项，请先整理已有洞察");
      return;
    }
    if (
      pins.some(
        (pin) => JSON.stringify(pin.plan) === JSON.stringify(scopedPlan),
      )
    ) {
      setToast("这项分析已在收藏中");
      return;
    }
    setPins((prev) => [
      ...prev,
      {
        id: `pin-${Date.now()}`,
        name: `${activePlan.title}${scopeFilters.length ? " · 已筛选" : ""}`,
        plan: structuredClone(scopedPlan),
        createdAt: new Date().toISOString(),
        note: "",
      },
    ]);
    setToast("已收藏分析口径，可在创新实验室中批注和对比");
  }
  function inspectGroup(plan: Plan, name: string) {
    try {
      const selected = {
        ...plan,
        filters: mergeFilters(scopeFilters, filtersForPlan(plan)),
      };
      setEvidence({
        title: `${plan.groupBy}：${name} · 来源明细`,
        dataset: evidenceRows(dataset, profile, selected, name),
        plan: selected,
        group: name,
      });
      setEvidenceFilter(groupFilter(plan, name, profile));
      setDialog("evidence");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  function navigateWorkspace(next: Tab) {
    setView("workspace");
    setTab(next);
    setDialog(null);
    setMobileChat(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function navigatePage(page: WorkspacePage) {
    const state = stateFromPage(page);
    setView(state.view);
    if (state.tab) setTab(state.tab);
    setDialog(null);
    setMobileChat(false);
    setAssistant(false);
  }
  const workspaceActions: WorkspaceAction[] = [
    { id: "overview", title: "工作台首页", description: "查看数据状态与任务入口", icon: <LayoutDashboard size={20} />, run: () => navigatePage("overview") },
    { id: "datasets", title: "我的数据集", description: "管理、导入与导出本机数据", icon: <Database size={20} />, run: () => navigatePage("datasets") },
    { id: "charts", title: "图表分析", description: "查看趋势与分组图表", keywords: "图表 柱状 折线 饼图", icon: <BarChart3 size={20} />, run: () => navigateWorkspace("charts") },
    { id: "preview", title: "数据预览", description: "搜索记录、字段排序、选择显示列并导出结果", keywords: "表格 排序 CSV Excel", icon: <Table2 size={20} />, run: () => navigateWorkspace("preview") },
    { id: "quality", title: "质量检查", description: "核对缺失、重复与无效值，按需清洗", keywords: "数据 清洗 空值", icon: <ShieldCheck size={20} />, run: () => navigateWorkspace("quality") },
    { id: "diagnostics", title: "业务诊断", description: "对比两个周期，查看各分组的变化", keywords: "同比 环比 增减 贡献", icon: <Activity size={20} />, run: () => navigateWorkspace("diagnostics") },
    { id: "intelligence", title: "智能分析", description: "分析路线、指标库与业务知识问答", keywords: "AI 工作流", icon: <Sparkles size={20} />, run: () => navigateWorkspace("intelligence") },
    { id: "lab", title: "创新实验室", description: "异常检测、情景推演与洞察收藏", keywords: "模拟 对比 IQR", icon: <FlaskConical size={20} />, run: () => navigateWorkspace("lab") },
    { id: "reports", title: "洞察报告", description: "回顾分析记录，预览和导出报告", keywords: "HTML Markdown PDF 下载", icon: <FileText size={20} />, run: () => { setDialog(null); setView("reports"); window.scrollTo({ top: 0, behavior: "instant" }); } },
    { id: "import", title: "导入数据", description: "导入 CSV、TSV 或 Excel 工作表", keywords: "上传 文件", icon: <Upload size={20} />, run: () => { setError(""); setDialog("upload"); } },
    { id: "dictionary", title: "字段字典", description: "设置业务含义、单位与字段别名", keywords: "说明 定义", icon: <BookOpen size={20} />, run: () => setDialog("dictionary") },
    { id: "settings", title: "设置与 API", description: "连接个人 API，查看工作空间配置", keywords: "DeepSeek OpenAI 密钥 模型", icon: <Settings2 size={20} />, run: () => setDialog("settings") },
  ];
  return (
    <>
    {libraryOperation && <div className="workspace-operation" role="status" aria-live="polite"><div><LoaderCircle size={24} className="spin" />{libraryOperation}</div></div>}
    <div
      inert={!!libraryOperation}
      className={`app-shell ${!assistant ? "assistant-hidden" : ""} ${mobileChat ? "mobile-chat-open" : ""}`}
    >
      {pendingFile && (
        <Suspense fallback={<ToolLoading />}>
          <LazyImportWizard
            file={pendingFile}
            onClose={() => setPendingFile(null)}
            onImport={setNewDataset}
          />
        </Suspense>
      )}
      <input
        type="file"
        ref={fileInput}
        accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          void uploadFile(e.target.files?.[0])
        }
      />
      {!ready && <div className="workspace-restore-shade" role={storageError === "read" ? "alert" : "status"}>
        <div className="workspace-restore-card">
          {storageError === "read" ? <AlertTriangle size={30} /> : <LoaderCircle size={30} className="spin" />}
          <h2>{storageError === "read" ? "暂时无法恢复工作空间" : "正在恢复你的工作空间"}</h2>
          <p>{storageError === "read" ? "已有记录不会被覆盖。请检查浏览器的本机存储权限，然后重试恢复。" : "正在读取本机保存的数据与分析设置。"}</p>
          {storageError === "read" && <button className="button primary" autoFocus onClick={() => setRestoreAttempt(n => n + 1)}><RotateCcw size={16} />重试恢复</button>}
        </div>
      </div>}
      <aside className="sidebar" inert={!ready || !!libraryOperation}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigatePage("overview");
          }}
        >
          <Brand />
          <div>
            <strong>
              数问<span className="brand-en">DataPilot</span>
            </strong>
            <span className="brand-caption">让数据，回答问题</span>
          </div>
        </a>
        <div className="workspace-picker">
          <span className="workspace-avatar">DP</span>
          <div>
            <strong>疯狂星期四</strong>
            <small>个人工作空间</small>
          </div>
        </div>
        <PageNavigation current={currentPage} onNavigate={navigatePage} />
        <div className="sidebar-dataset-context">
        <div className="sidebar-section-title">
          <span>当前数据集</span>
          <button
            className="icon-button"
            aria-label="添加数据集"
            onClick={() => {
              setError("");
              setDialog("upload");
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <button
          className="dataset-link"
          onClick={() => {
            setView("workspace");
            setTab("preview");
          }}
        >
          <FileSpreadsheet size={16} />
          <span title={dataset.name}>{dataset.name}</span>
          <span className="dataset-dot" />
        </button>
        <div className="dataset-meta-sidebar">
          {formatNumber(profile.rowCount)} 行 <span>·</span>{" "}
          {profile.columnCount} 个字段
        </div>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setDialog("settings")}>
            <Settings2 size={17} />
            <span>设置</span>
          </button>
          <button className="nav-item" onClick={() => setDialog("dictionary")}>
            <BookOpen size={18} />
            <span>字段字典</span>
          </button>
          <button className="nav-item" onClick={() => setDialog("help")}>
            <CircleHelp size={17} />
            <span>帮助</span>
            <ArrowUpRight size={13} className="push-right" />
          </button>
        </div>
      </aside>
      <section className="main-shell" inert={!ready || !!libraryOperation}>
        <header className="topbar">
          <div className="breadcrumb">
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>
              {pageInfo.title}
            </strong>
          </div>
          <div className="topbar-right">
            <button className="workspace-search-trigger" onClick={() => setDialog("search")} aria-label="搜索功能（Ctrl+K）">
              <Search size={16} /><span>搜索功能</span><kbd>Ctrl K</kbd>
            </button>
            <span className="save-status">
              {storageError ? <AlertTriangle size={14} /> : saved ? <span className="status-dot" /> : <LoaderCircle size={14} className="spin" />}
              {storageError ? "本机存储异常" : saved ? "已保存在本机" : ready ? "正在保存" : "正在恢复"}
            </span>
            <span className="topbar-separator" />
            <button
              className="icon-button"
              aria-label="使用帮助"
              onClick={() => setDialog("help")}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="settings-top-button"
              onClick={() => setDialog("settings")}
              aria-label="设置与 API"
            >
              <Settings2 size={17} /><span>设置与 API</span>
            </button>
            {view !== "datasets" && <button className="workspace-assistant-trigger" aria-label="分析助手" aria-expanded={assistant} title="打开或收起分析助手" onClick={() => { setAssistant(!assistant); setMobileChat(!assistant); }}><Sparkles size={17} /><span>分析助手</span></button>}
          </div>
        </header>
        <div className="content-shell">
          <main className="workspace-content" id="workspace-main">
            <div className="page-heading">
              <div>
                <div className="workspace-heading-label"><span />{view === "workspace" ? "数据工作空间" : view === "datasets" ? "数据管理" : "分析成果"}</div>
                <h1 id="workspace-page-title" tabIndex={-1}>
                  {pageInfo.title}
                </h1>
                <p>
                  {pageInfo.description}
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setError("");
                  setDialog("upload");
                }}
              >
                <Plus size={16} />
                导入数据
              </button>
            </div>
            {storageError === "write" && <div className="workspace-notice warning" role="alert">
              <AlertTriangle size={20} />
              <div><strong>本次更改尚未保存</strong><p>{saveMessage || "当前页面仍可继续使用。可重试保存或导出项目备份。"}</p></div>
              <button className="button subtle" onClick={() => void exportProject()}>导出项目备份</button>
              {saveMessage.includes("另一个标签页") ? <button className="button subtle" onClick={() => setRestoreAttempt(n => n + 1)}>载入另一页已保存版本</button> : <button className="button subtle" onClick={() => setSaveAttempt(n => n + 1)}><RotateCcw size={15} />重试</button>}
            </div>}
            <PageSwitcher current={currentPage} onNavigate={navigatePage} />
            <PanelBoundary key={`${dataset.id}:${currentPage}`} onHome={() => navigatePage("overview")}>
            {view !== "datasets" && <div className="workspace-context">
            <button className="dataset-banner" aria-label="查看当前数据集" onClick={() => { setView("workspace"); setTab("preview"); }}>
              <div className="dataset-file-icon">
                <FileSpreadsheet size={21} />
              </div>
              <div className="dataset-banner-info">
                <strong>{dataset.name}</strong>
                <span>
                  {dataset.source === "demo"
                    ? "内置合成演示数据"
                    : "本机上传的数据"}
                  <i /> {formatNumber(profile.rowCount)} 行 ×{" "}
                  {profile.columnCount} 列
                </span>
              </div>
              <span className="dataset-open-label"><span>查看数据</span><ChevronRight size={18} /></span>
            </button>
            {view === "workspace" && tab !== "quality" && <FilterBar
              dataset={dataset} profile={profile} filters={scopeFilters}
              count={scopeDataset.rows.length} onChange={changeScope}
            />}
            </div>}
            {view === "workspace" && (
              <>
                {tab !== "quality" && scopeFilters.length > 0 && !scopeDataset.rows.length && <div className="workspace-notice" role="status">
                  <Filter size={20} /><div><strong>当前条件没有匹配的数据</strong><p>放宽联动筛选，或恢复全部记录后继续分析。</p></div>
                  <button className="button subtle" onClick={() => changeScope([])}><RotateCcw size={15} />重置筛选</button>
                </div>}
                <div id="workspace-panel" className="workspace-page-content" data-page={currentPage} role="region" aria-label={pageInfo.title}>
                {tab === "overview" && (
                  <>
                    <AnalysisLaunch key={dataset.id} home fields={dataset.columns} scopeLabel={`${scopeDataset.rows.length.toLocaleString()} 条记录${scopeFilters.length ? " · 已筛选" : " · 全部数据"}`} questions={starters} model={!!visitorModel} busy={busy} onAsk={text => { setPreviewFirst(true); void ask(text, true); }} />
                    <div className="overview-section-heading"><h2>数据概况</h2><span>{scopeFilters.length ? "当前筛选范围" : "全部记录"}<i />{formatNumber(scopeDataset.rows.length)} 条数据</span></div>
                    <div className="metric-grid">
                      <div className="metric-card">
                        <div>
                          <span>
                            {primaryMetric
                              ? `${primaryMetric.name}合计`
                              : "记录总数"}
                          </span>
                          <span className="metric-icon">
                            <TrendingUp size={16} />
                          </span>
                        </div>
                        <strong>
                          {primaryMetric &&
                            /额|利润|收入/.test(primaryMetric.name) && (
                              <small>¥</small>
                            )}
                          {formatNumber(
                            primaryMetric
                              ? sumField(primaryMetric.name)
                              : scopeDataset.rows.length,
                            true,
                          )}
                        </strong>
                        <p>
                          <span className="metric-foot-dot" />{" "}
                          {primaryMetric
                            ? (scopeFilters.length ? "基于当前筛选范围" : "基于全部数据计算")
                            : (scopeFilters.length ? "当前筛选范围的记录" : "当前数据集全部记录")}
                        </p>
                        <svg
                          viewBox="0 0 100 28"
                          className="metric-spark"
                          aria-hidden="true"
                        >
                          <path
                            d={metricSparkPath}
                            fill="none"
                            stroke="#a9d4be"
                            strokeWidth="2"
                          />
                        </svg>
                      </div>
                      <div className="metric-card">
                        <div>
                          <span>
                            {scopeFilters.length ? "筛选后记录" : "数据记录"}
                          </span>
                          <span className="metric-icon blue">
                            <Database size={16} />
                          </span>
                        </div>
                        <strong>
                          {formatNumber(scopeDataset.rows.length)}
                          <small className="metric-suffix">条</small>
                        </strong>
                        <p>
                          <span className="neutral-dot" />
                          {profile.columnCount} 个字段 · {metrics.length}{" "}
                          个数值字段
                        </p>
                      </div>
                      <div className="metric-card">
                        <div>
                          <span>
                            {profitMetric
                              ? `${profitMetric.name}合计`
                              : "分类字段"}
                          </span>
                          <span className="metric-icon amber">
                            <Activity size={16} />
                          </span>
                        </div>
                        <strong>
                          {profitMetric &&
                            /额|利润|收入/.test(profitMetric.name) && (
                              <small>¥</small>
                            )}
                          {formatNumber(
                            profitMetric
                              ? sumField(profitMetric.name)
                              : dimensions.length,
                            true,
                          )}
                          {!profitMetric && (
                            <small className="metric-suffix">个</small>
                          )}
                        </strong>
                        <p>
                          <span className="neutral-dot" />
                          {profitMetric
                            ? "缺失与无效数值不参与聚合"
                            : "支持分组、筛选与趋势探索"}
                        </p>
                      </div>
                      <div className="metric-card">
                        <div>
                          <span>原始数据完整率</span>
                          <span className="metric-icon purple">
                            <ShieldCheck size={16} />
                          </span>
                        </div>
                        <strong>
                          {profile.completeness.toFixed(1)}
                          <small className="metric-suffix">%</small>
                        </strong>
                        <p>
                          <span
                            className={
                              profile.missing ? "amber-text" : "green-text"
                            }
                          >
                            {profile.missing
                              ? `${profile.missing} 个缺失单元格`
                              : "字段完整，无缺失"}
                          </span>
                          <button
                            className="inline-link"
                            onClick={() => setTab("quality")}
                          >
                            查看 <ArrowRight size={11} />
                          </button>
                        </p>
                      </div>
                    </div>
                    <WorkspaceHome onNavigate={navigatePage} rows={scopeDataset.rows.length} issues={profile.missing + profile.duplicates + quality.invalid} analyses={reportItems.length} recent={recentPages}
                      collection={<AnalysisCollection current={scopedPlan} entries={entries} pins={pins} onOpen={openAnalysis} onReport={() => navigatePage("reports")} />}
                      templates={<AnalysisTemplates key={dataset.id} dataset={dataset} profile={profile} onApply={applyTemplate} onUndo={configUndo?.label === "模板应用" && configUndo.after === configurationKey(currentSnapshot()) ? undoConfiguration : undefined} />} />
                  </>
                )}
                {tab === "charts" && (
                  <>
                    <div className="chart-section-heading">
                      <div>
                        <h2>可视化探索</h2>
                        <span>选择维度与指标，点击图表核对来源</span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setAssistant(true);
                          setMobileChat(true);
                          input.current?.focus();
                        }}
                      >
                        <Sparkles size={14} />
                        自定义分析
                      </button>
                    </div>
                    <div className="overview-chart-layout">
                    <section className={`chart-card main-chart-card${chartSettingsOpen ? "" : " chart-settings-collapsed"}`}>
                      <ChartStudioHeader title={activePlan.title} groups={result.points.length} rows={scopeDataset.rows.length} onPin={pinCurrent} onReport={() => navigatePage("reports")} settingsOpen={chartSettingsOpen} onSettings={() => setChartSettingsOpen(open => !open)} />
                      <div id="chart-settings-panel" hidden={!chartSettingsOpen}><ChartConfiguration plan={activePlan} profile={profile} unit={result.unit} onChange={updateChartControls} showSQL={showSQL} onSQL={() => setShowSQL(!showSQL)} /></div>
                      <div className="chart-result-panel">
                      {!result.points.length && scopeFilters.length > 0 && <button className="button subtle chart-clear-scope" onClick={() => changeScope([])}>清除筛选，查看全部数据</button>}
                      <DataChart
                        plan={activePlan}
                        result={result}
                        onRange={
                          profile.fields.find(
                            (f) => f.name === activePlan.groupBy,
                          )?.type === "date" && activePlan.sort === "natural"
                            ? applyChartRange
                            : undefined
                        }
                        onPointClick={(name) => inspectGroup(scopedPlan, name)}
                      />
                      <div className="drill-strip">
                        <FileSearch size={13} />
                        <span>追溯来源</span>
                        {result.points.slice(0, 8).map((point) => (
                          <button
                            key={point.name}
                            onClick={() => inspectGroup(scopedPlan, point.name)}
                            aria-label={`查看 ${point.name} 来源明细`}
                          >
                            {point.name}
                            <ArrowUpRight size={10} />
                          </button>
                        ))}
                      </div>
                      {showSQL && (
                        <div className="sql-panel" id="chart-sql-detail">
                          <div>
                            <Code2 size={14} />
                            分析口径<span>只读示意</span>
                          </div>
                          <pre>{result.sql}</pre>
                        </div>
                      )}
                      <div className="chart-insight">
                        <span className="insight-icon">
                          <Lightbulb size={15} />
                        </span>
                        <p>{result.summary}</p>
                      </div>
                      </div>
                    </section>
                    <details className="overview-supporting-wrap"><summary>探索其他维度 · 分组对比与构成</summary><div className="small-chart-grid overview-supporting-charts">
                      <section className="chart-card">
                        <div className="card-heading">
                          <div>
                            <h3>{secondaryPlan.title}</h3>
                            <p>
                              按{secondaryPlan.metric || "记录数"}排序 · 前5组
                            </p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="展开分组分析"
                            onClick={() => setActivePlan(secondaryPlan)}
                          >
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                        <DataChart
                          plan={secondaryPlan}
                          result={secondary}
                          small
                          onPointClick={(name) =>
                            inspectGroup(secondaryPlan, name)
                          }
                        />
                        <div className="chart-footer">
                          <span className="legend-dot" />{" "}
                          {secondaryPlan.metric || "记录数"}{" "}
                          <span className="push-right">右上角可切换主图</span>
                        </div>
                      </section>
                      <section className="chart-card">
                        <div className="card-heading">
                          <div>
                            <h3>{categoryPlan.title}</h3>
                            <p>
                              {categoryPlan.aggregate === "count"
                                ? "记录数"
                                : categoryPlan.metric}
                              分布 · 前6组
                            </p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="展开构成分析"
                            onClick={() => setActivePlan(categoryPlan)}
                          >
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                        <DataChart
                          plan={categoryPlan}
                          result={category}
                          small
                          onPointClick={(name) => inspectGroup(categoryPlan, name)}
                        />
                        <div className="chart-footer">
                          显示实际聚合结果
                          <span className="push-right">
                            {category.points.length} 个分组
                          </span>
                        </div>
                      </section>
                    </div></details>
                    </div>
                    <AnalysisLaunch key={dataset.id} questions={starters} model={!!visitorModel} busy={busy} onAsk={text => {
                      setAssistant(true); setMobileChat(true); setAssistantTab("chat");
                      void ask(text);
                    }} />
                  </>
                )}
                {tab === "charts" && (
                  <EvidenceGuide
                    facts={analysisFacts(result, scopedPlan)}
                    onSource={(fact) => {
                      if (fact.group) inspectGroup(scopedPlan, fact.group);
                      else {
                        setEvidence({
                          title: "当前分析范围 · 来源记录",
                          dataset: scopeDataset,
                        });
                        setEvidenceFilter(null);
                        setDialog("evidence");
                      }
                    }}
                  />
                )}
                {tab === "diagnostics" && (
                  <Suspense fallback={<ToolLoading />}>
                    <LazyDiagnostics
                      key={dataset.id}
                      dataset={dataset}
                      profile={profile}
                      filters={scopeFilters}
                      state={tools.diagnostic}
                      onChange={(diagnostic) =>
                        setTools((previous) => ({ ...previous, diagnostic }))
                      }
                      savedMetrics={tools.metrics}
                      onMetricsChange={(metrics) =>
                        setTools((previous) => ({ ...previous, metrics }))
                      }
                      onInspect={(source, title) => {
                        setEvidence({ title, dataset: source });
                        setEvidenceFilter(null);
                        setDialog("evidence");
                      }}
                      onExport={(name, text) => {
                        download(name, text, "text/markdown;charset=utf-8");
                        setToast("已导出完整周期诊断与口径");
                      }}
                    />
                  </Suspense>
                )}
                {tab === "intelligence" && (
                  <Suspense fallback={<ToolLoading />}>
                    <LazyIntelligence
                      key={dataset.id}
                      dataset={dataset}
                      profile={profile}
                      filters={scopeFilters}
                      tools={tools}
                      onChange={(patch) =>
                        setTools((previous) => ({ ...previous, ...patch }))
                      }
                      onInspect={(source, title) => {
                        setEvidence({ title, dataset: source });
                        setEvidenceFilter(null);
                        setDialog("evidence");
                      }}
                      onExport={(name, text) => {
                        download(name, text, "text/markdown;charset=utf-8");
                        setToast("已导出完整分析报告与来源口径");
                      }}
                      onOpenDiagnostic={(plan) => {
                        setTools((previous) => ({
                          ...previous,
                          diagnostic: {
                            ...previous.diagnostic,
                            date: plan.date,
                            metric: plan.metric,
                            dimension: plan.dimensions[0],
                            current: plan.current,
                            previous: plan.previous,
                          },
                        }));
                        setTab("diagnostics");
                      }}
                    />
                  </Suspense>
                )}
                {tab === "lab" && (
                  <ExplorationLab
                    key={dataset.id}
                    dataset={scopeDataset}
                    sourceDataset={dataset}
                    profile={profile}
                    plan={scopedPlan}
                    pins={pins}
                    onPinsChange={setPins}
                    onOpenPlan={openAnalysis}
                    onPinCurrent={pinCurrent}
                    onInspectRow={(index) => {
                      setEvidence({
                        title: `异常线索 · 筛选内记录 #${index + 1}`,
                        dataset: {
                          ...scopeDataset,
                          rows: [scopeDataset.rows[index]],
                        },
                      });
                      setEvidenceFilter(null);
                      setDialog("evidence");
                    }}
                    onExport={(name, text) => {
                      download(name, text, "text/markdown;charset=utf-8");
                      setToast("已导出计算依据与说明");
                    }}
                  />
                )}
                {tab === "preview" && <DataPreview dataset={scopeDataset} profile={profile}
                  viewState={previewView.datasetId === dataset.id ? previewView.value : undefined}
                  onViewChange={value => setPreviewView({ datasetId: dataset.id, value })}
                  onExport={data => download(data.name, toCSV(data), "text/csv;charset=utf-8")} />}
                {tab === "quality" && (
                  <>
                    <nav className="quality-section-nav" aria-label="质量检查分区">
                      {[["quality-audit-title", "基础问题"], ["business-rules-title", "业务规则"], ["quality-fields-title", "字段详情"]].map(([id, label]) => <button key={id} onClick={() => { const heading = document.getElementById(id); heading?.scrollIntoView({ block: "start" }); heading?.focus({ preventScroll: true }); }}>{label}</button>)}
                    </nav>
                    <section className="quality-summary chart-card">
                      <div className="quality-score">
                        <ShieldCheck size={29} />
                        <strong>{profile.quality.toFixed(1)}</strong>
                        <span>完整与去重评分 / 100</span>
                      </div>
                      <div className="quality-overview">
                        <h3>
                          {quality.title}
                        </h3>
                        <p>
                          完整率 {profile.completeness.toFixed(2)}%，
                          {profile.missing} 个缺失单元格，{profile.duplicates}{" "}
                          条完全重复记录，{quality.invalid} 个无效值。
                        </p>
                        <p className="quality-formula">
                          评分 = 完整率 − 20 × 重复记录占比。此辅助分不计入无效值；数值计算会排除无效值，请同时核对下方字段检查。
                        </p>
                        <div className="quality-actions">
                          <button
                            className="button primary"
                            onClick={() => setDialog("clean")}
                          >
                            <WandSparkles size={15} />
                            清洗数据
                          </button>
                          {undo && (
                            <button
                              className="button subtle"
                              onClick={() => {
                                setDataset(undo);
                                if (undoTools) setTools(undoTools);
                                setEntries(undoEntries);
                                setPins(undoPins);
                                setScopeFilters(undoFilters);
                                setUndo(null);
                                setUndoEntries([]);
                                setToast("已撤销清洗，恢复原始数据");
                              }}
                            >
                              <RotateCcw size={14} />
                              撤销清洗
                            </button>
                          )}
                        </div>
                      </div>
                    </section>
                    <QualityAudit key={dataset.id} dataset={dataset} profile={profile} onExport={data => download(data.name, toCSV(data), "text/csv;charset=utf-8")} />
                    <BusinessRules key={`rules-${dataset.id}`} dataset={dataset} rules={tools.rules || []}
                      onChange={rules => setTools(previous => ({ ...previous, rules }))}
                      onInspect={index => { setEvidence({ title: `业务规则 · 第 ${index + 1} 条完整记录`, sourceRow: index + 1, description: "当前记录触发了所选业务规则。请结合完整字段核对原因；记录序号对应整个当前数据集，不受分析筛选影响。", dataset: { ...dataset, rows: [dataset.rows[index]] } }); setEvidenceFilter(null); setDialog("evidence"); }}
                      onExport={data => download(data.name, toCSV(data), "text/csv;charset=utf-8")}
                      onReport={text => download("业务规则检查报告.md", text, "text/markdown;charset=utf-8")} />
                    <section className="table-card">
                      <div className="card-heading">
                        <div>
                          <h3 id="quality-fields-title" tabIndex={-1}>字段质量详情</h3>
                          <p>
                            数值缺失不当作
                            0；完全重复记录默认保留，清洗前后可核对。
                          </p>
                        </div>
                      </div>
                      <div className="table-overflow">
                        <table className="data-table quality-table">
                          <thead>
                            <tr>
                              <th>字段名称</th>
                              <th>推断类型</th>
                              <th>缺失值</th>
                              <th>无效值</th>
                              <th>不同值</th>
                              <th>完整率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {profile.fields.map((f) => (
                              <tr key={f.name}>
                                <td>
                                  <strong>{f.name}</strong>
                                </td>
                                <td>
                                  <span className="type-badge">
                                    {f.type === "number"
                                      ? "数值"
                                      : f.type === "date"
                                        ? "日期"
                                        : "文本"}
                                  </span>
                                </td>
                                <td className={f.missing ? "amber-text" : ""}>
                                  {f.missing}
                                </td>
                                <td className={f.invalid ? "amber-text" : ""}>
                                  {f.invalid}
                                </td>
                                <td>{f.unique.toLocaleString()}</td>
                                <td>
                                  <div className="quality-bar">
                                    <span
                                      style={{
                                        width: `${profile.rowCount ? 100 * (1 - f.missing / profile.rowCount) : 100}%`,
                                      }}
                                    />
                                  </div>
                                  {(
                                    profile.rowCount ? 100 * (1 - f.missing / profile.rowCount) : 100
                                  ).toFixed(1)}
                                  %
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}
                </div>
                {tab === "charts" && journey.datasetId === dataset.id && journey.steps.length > 1 && <details className="workspace-history" open={replaying || undefined}>
                  <summary><History size={16} /><strong>探索历史</strong><span>{journey.steps.length} 步分析 · 可恢复与回放</span><ChevronDown size={16} /></summary>
                <AnalysisJourney
                  state={
                    journey.datasetId === dataset.id
                      ? journey
                      : { datasetId: dataset.id, steps: [], cursor: -1 }
                  }
                  playing={replaying}
                  onRestore={restoreStep}
                  onPlay={() => {
                    if (journey.cursor >= journey.steps.length - 1)
                      restoreStep(0, true);
                    else setReplaying(true);
                  }}
                  onPause={() => setReplaying(false)}
                />
                </details>}
              </>
            )}
            {view === "datasets" && (<>
              <details className="library-backup-disclosure"><summary><Download size={16} />项目备份与迁移<span>导出或恢复完整项目</span><ChevronRight size={16} /></summary><ProjectBackup snapshot={currentSnapshot()} disabled={!!libraryOperation} onRestore={restoreProject} /></details>
              <DatasetLibrary dataset={dataset} items={library} loading={libraryLoading} busy={!!libraryOperation}
                error={libraryError} saved={saved && !storageError} saveError={storageError === "write"} canUndo={!!removedCopy}
                onSave={() => void saveCurrentCopy()} onOpen={id => void openLibraryCopy(id)}
                onDelete={id => void removeLibraryCopy(id)} onUndo={() => void undoRemoveCopy()}
                onRefresh={() => void refreshLibrary()} onImport={() => { setError(""); setDialog("upload"); }}
                onFile={file => void uploadFile(file)} onAnalyze={() => navigatePage("charts")}
                onDownload={() => download(dataset.name.replace(/\.[^.]+$/, "") + ".csv", toCSV(dataset), "text/csv;charset=utf-8")}
              />
            </>)}
            {view === "reports" && (
              <ReportCenter draft={reportDraft} basis={reportBasis} saved={saved && !storageError} onDraft={updateDraft} onPresent={() => setPresenting(true)} dataset={dataset} profile={profile} items={reportItems} selected={selectedReports} rules={tools.rules || []}
                onToggle={toggleReport}
                onSelectAll={all => updateDraft({ omitted: all ? [] : reportItems.map(item => item.key) })}
                onPreview={previewReport} onExport={exportReport} onReview={() => navigatePage("quality")}
                onOpen={plan => { openAnalysis(plan); navigatePage("charts"); }}
                onEvidence={plan => {
                  setEvidence({ title: plan.title + " · 来源记录", plan, dataset: filterDataset(dataset, filtersForPlan(plan)) });
                  setEvidenceFilter(null); setDialog("evidence");
                }} />
            )}
            <NextPages current={currentPage} onNavigate={navigatePage} />
            </PanelBoundary>
            <footer className="workspace-footer">
              <span>
                <ShieldCheck size={12} />
                原始数据留本机，分析有据可查
              </span>
              <span>
                数问 DataPilot <i /> 为每一个好奇的问题
              </span>
            </footer>
          </main>
          {assistant && mobileChat && <button className="assistant-backdrop" aria-label="关闭分析助手遮罩" onClick={() => { setAssistant(false); setMobileChat(false); }} />}
          {assistant && (
            <aside className="assistant-panel" aria-label="分析助手">
              <div className="assistant-header">
                <span className="assistant-symbol">
                  <Sparkles size={18} />
                </span>
                <div>
                  <strong>数问分析助手</strong>
                  <small>
                    <span />{" "}
                    {mode === "model"
                      ? "个人 API · 配置仅本页生效"
                      : "本地助手 · 无需 API"}
                  </small>
                  {!visitorModel && <button className="assistant-api-link" onClick={() => { setMobileChat(false); setDialog("settings"); }}>接入我的 API</button>}
                </div>
                <button
                  className="icon-button"
                  aria-label="收起分析助手"
                  onClick={() => {
                    setAssistant(false);
                    setMobileChat(false);
                  }}
                >
                  <PanelRightClose size={17} />
                </button>
              </div>
              <div className="assistant-dataset">
                <span className="tiny-file">
                  <FileSpreadsheet size={14} />
                </span>
                <span>{dataset.name}</span>
                <Check size={13} />
              </div>
              <div
                className="assistant-tabs"
                role="tablist"
                aria-label="助手工作模式"
              >
                <button
                  role="tab"
                  aria-selected={assistantTab === "chat"}
                  onClick={() => setAssistantTab("chat")}
                >
                  <MessageSquare size={13} />
                  对话助手
                </button>
                <button
                  role="tab"
                  aria-selected={assistantTab === "navigator"}
                  onClick={() => setAssistantTab("navigator")}
                >
                  <WandSparkles size={13} />
                  探索导航
                </button>
              </div>
              <div className="chat-scroll" ref={chatScroll}>
                {assistantTab === "navigator" ? (
                  <ExplorationNavigator
                    tasks={navigationTasks}
                    count={scopeDataset.rows.length}
                    disabled={busy}
                    onPreview={previewTask}
                    onAsk={(question) => void ask(question)}
                  />
                ) : (
                  <>
                    <ContextAssistant key={`${dataset.id}:${currentPage}`} page={pageInfo.title} scope={`当前 ${scopeDataset.rows.length.toLocaleString()} / ${dataset.rows.length.toLocaleString()} 条记录 · ${scopeFilters.length} 项筛选`} actions={contextActions(currentPage, profile, scopedPlan)} disabled={busy} onAction={runContextAction} />
                    {configUndo && configUndo.after === configurationKey(currentSnapshot()) && <button className="button subtle" onClick={undoConfiguration}>撤销{configUndo.label}</button>}
                    <details className="assistant-start-guide" open={!entries.length && !localReply && !proposal && !clarification && !busy}>
                    <summary><Sparkles size={15} />问题建议与快捷工具<ChevronDown size={15} /></summary>
                    <div className="assistant-intro">
                      <div className="intro-orbit">
                        <Brand />
                      </div>
                      <h2>一起读懂这份数据</h2>
                      <p>{visitorModel ? "选择下方问题，或输入你想核查的指标。" : "可直接统计、筛选和检查数据；结果来自本机计算。"}</p>
                      <div className="intro-meta">
                        <span>{profile.columnCount} 个字段已就绪</span>
                        <span>可追溯的计算结果</span>
                      </div>
                    </div>
                    {!visitorModel && <div className="local-assistant-shortcuts" aria-label="本地助手快捷功能">
                      {["数据概览", "质量摘要", "查看字段", "怎么使用"].map(q => <button key={q} onClick={() => void ask(q)}>{q}</button>)}
                    </div>}
                    <div className="comparison-nudge">
                      <button
                        onClick={() => {
                          setView("workspace");
                          setTab("diagnostics");
                          setMobileChat(false);
                        }}
                      >
                        周期对比与变化贡献 →
                      </button>
                    </div>
                    <div className="starter-title">
                      <Sparkles size={13} />
                      不妨从这里开始
                    </div>
                    <div className="starter-list">
                      {starters.map((s, i) => (
                        <button
                          key={s}
                          onClick={() => void ask(s)}
                          disabled={busy}
                        >
                          <span>
                            {i === 0 ? (
                              <TrendingUp size={15} />
                            ) : i === 1 ? (
                              <BarChart3 size={15} />
                            ) : (
                              <Braces size={15} />
                            )}
                          </span>
                          {s}
                          <ArrowUpRight size={13} />
                        </button>
                      ))}
                    </div>
                    </details>
                    {entries.length > 0 && (
                      <div className="chat-divider">
                        <span>本次探索</span>
                      </div>
                    )}
                    {entries.map((entry) => (
                      <div className="chat-exchange" key={entry.id}>
                        <div className="user-message">{entry.question}</div>
                        <div className="assistant-message">
                          <div className="message-brand">
                            <Brand small />
                            <span>数问</span>
                            <small>
                              {entry.origin === "navigator"
                                ? "数据导航"
                                : entry.mode === "model"
                                  ? "模型规划"
                                  : "本地规则"}
                            </small>
                          </div>
                          <p>{entry.result.summary}</p>
                          <button
                            className="analysis-result-card"
                            onClick={() => {
                              openAnalysis(entry.plan);
                              setView("workspace");
                              setTab("charts");
                            }}
                          >
                            <BarChart3 size={19} />
                            <span>
                              <strong>{entry.plan.title}</strong>
                              <small>
                                {entry.result.validRows.toLocaleString()} 条记录
                                · 点击查看图表
                              </small>
                            </span>
                            <ArrowUpRight size={14} />
                          </button>
                          <details className="evidence-details">
                            <summary>
                              <ShieldCheck size={12} />
                              查看分析依据 <ChevronDown size={12} />
                            </summary>
                            <p>
                              相关字段：{entry.retrieved.join("、")}。<br />
                              计算方式：{entry.plan.aggregate}(
                              {entry.plan.metric || "*"})，按
                              {entry.plan.groupBy}
                              分组。
                              <br />
                              排除无效指标：{entry.result.excluded}{" "}
                              条。统计由本地引擎实际执行。
                            </p>
                          </details>
                          {entry.id === entries[entries.length - 1]?.id && (
                            <div className="followup-actions">
                              {activePlan.metric && (
                                <button
                                  disabled={busy}
                                  onClick={() => void ask("改成均值")}
                                >
                                  改成均值
                                </button>
                              )}
                              {dimensions.find(
                                (f) =>
                                  f.name !== activePlan.groupBy &&
                                  f.type === "text" &&
                                  f.unique < 30,
                              ) && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void ask(
                                      `再按${dimensions.find((f) => f.name !== activePlan.groupBy && f.type === "text" && f.unique < 30)!.name}看${activePlan.metric || "记录数"}`,
                                    )
                                  }
                                >
                                  换个维度继续看 <ArrowRight size={9} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {localReply && assistantTab === "chat" && <div className="chat-exchange local-assistant-reply" role="status">
                  <div className="user-message">{localReply.question}</div>
                  <div className="assistant-message">
                    <div className="message-brand"><Brand small /><span>数问</span><small>本地计算 · 未调用模型</small></div>
                    <strong>{localReply.reply.title}</strong>
                    {localReply.reply.lines.map((line, index) => <p key={index}>{line}</p>)}
                    {/能力范围|明确的问法|核对当前数据/.test(localReply.reply.title) && <div className="followup-actions">{["数据概览", ...starters.slice(0, 2)].map(q => <button key={q} onClick={() => void ask(q, true)}>{q}</button>)}</div>}
                    {localReply.reply.action && <button className="button subtle" onClick={() => openLocalAction(localReply.reply.action!)}>
                      {({ quality: "打开质量检查", preview: "查看原始数据", delivery: "打开报告中心", diagnostics: "打开本地周期对比", help: "查看使用帮助" })[localReply.reply.action]} <ArrowRight size={14} />
                    </button>}
                  </div>
                </div>}
                {clarification && (
                  <div className="clarification-card" role="status">
                    <strong>先确认分析口径</strong>
                    <p>{clarification.reason}</p>
                    <small>原问题：{clarification.question}</small>
                    {clarification.choices.map((c) => (
                      <button
                        key={c.label}
                        onClick={() => void ask(c.question)}
                      >
                        {c.label} →
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setQuestion(clarification.question);
                        setClarification(null);
                      }}
                    >
                      返回修改问题
                    </button>
                  </div>
                )}
                {proposal && (
                  <PlanReview
                    question={proposal.question}
                    plan={proposal.plan}
                    result={proposal.result}
                    mode={proposal.origin}
                    onApply={() => commitProposal(proposal)}
                    onDiscard={() => {
                      setProposal(null);
                      setToast("已放弃计划，工作台保持原口径");
                    }}
                  />
                )}
                {busy && (
                  <div className="analysis-progress" role="status">
                    <div>
                      <LoaderCircle size={16} className="spin" />
                      正在分析你的问题
                    </div>
                    {steps.map((s, i) => (
                      <p key={i}>
                        <Check size={12} />
                        {s}
                      </p>
                    ))}
                    <button
                      className="text-button"
                      onClick={() => {
                        requestGeneration.current++;
                        abort.current?.abort();
                        setBusy(false);
                        setSteps([]);
                        setToast("已停止分析");
                      }}
                    >
                      停止分析
                    </button>
                  </div>
                )}
                {error && dialog !== "upload" && (
                  <div className="error-message" role="alert">
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                    <button
                      className="icon-button"
                      aria-label="关闭错误提示"
                      onClick={() => setError("")}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                <div ref={chatBottom} />
              </div>
              <div className="composer-area">
                <label className="preview-preference">
                  <input
                    type="checkbox"
                    checked={previewFirst}
                    onChange={(event) => setPreviewFirst(event.target.checked)}
                  />
                  先确认分析计划
                </label>
                <div className="composer">
                  <textarea
                    ref={input}
                    aria-label="向数据提问"
                    placeholder={visitorModel ? "向数据提问，比如：哪个地区销售额最高？" : "如：销售额合计、质量摘要、只看华南"}
                    value={question}
                    maxLength={2000}
                    disabled={busy}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void ask();
                      }
                    }}
                  />
                  <div className="composer-tools">
                    <span>
                      <Sparkles size={13} />
                      {mode === "model" ? "智能分析" : "本地分析"}
                    </span>
                    <button
                      className="send-button"
                      aria-label="发送分析问题"
                      disabled={!question.trim() || busy}
                      onClick={() => void ask()}
                    >
                      {busy ? (
                        <LoaderCircle size={15} className="spin" />
                      ) : (
                        <ArrowRight size={17} />
                      )}
                    </button>
                  </div>
                </div>
                <p className="composer-note">
                  {mode === "demo"
                    ? "本地规则支持常用统计；复杂语义可接入个人 API"
                    : "模型提出计划，计算结果由本地数据验证"}
                </p>
              </div>
            </aside>
          )}
        </div>
      </section>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {presenting && <ReportPresentation title={reportDraft.title} items={selectedReports} dataset={dataset} profile={profile} onClose={() => setPresenting(false)} />}
      {dialog === "search" && <Modal title="查找工作空间功能" className="workspace-search-modal" onClose={() => setDialog(null)}><WorkspaceSearch actions={workspaceActions} /></Modal>}
      {dialog === "evidence" && evidence && (
        <Modal
          className="evidence-modal"
          title={evidence.title}
          subtitle={evidence.sourceRow ? "核对业务规则对应的原始记录。" : "图表背后的每条记录，都可检查。"}
          onClose={() => setDialog(null)}
        >
          <EvidenceView
            selection={evidence}
            dimensions={profile.fields
              .filter(
                (f) => f.type !== "number" && f.name !== evidence.plan?.groupBy,
              )
              .map((f) => f.name)}
            onDrill={
              evidence.plan && evidence.group !== undefined
                ? (field) => {
                    try {
                      openAnalysis(
                        drillPlan(
                          evidence.plan!,
                          evidence.group!,
                          field,
                          profile,
                        ),
                      );
                      setDialog(null);
                      setToast("已保留当前分组，继续按新维度分析");
                    } catch (e) {
                      setToast((e as Error).message);
                    }
                  }
                : undefined
            }
            onExport={(data) => {
              download(
                `来源明细_${data.name}`,
                toCSV(data),
                "text/csv;charset=utf-8",
              );
              setToast("已导出来源明细");
            }}
            onFilter={
              evidenceFilter
                ? () => {
                    try {
                      changeScope(mergeFilters(scopeFilters, [evidenceFilter]));
                      setDialog(null);
                      setToast("已联动到所选分组，全部图表同步更新");
                    } catch (e) {
                      setToast((e as Error).message);
                    }
                  }
                : undefined
            }
          />
        </Modal>
      )}
      {dialog === "dictionary" && (
        <Modal
          title="字段字典"
          subtitle="让缩写、业务含义和常用说法对齐。"
          onClose={() => setDialog(null)}
        >
          <DictionaryEditor
            profile={profile}
            dictionary={dictionary}
            onSave={(value) => {
              changeScope(scopeFilters);
              setDictionary(value);
              setDialog(null);
              setToast("字段字典已保存，后续提问将使用这些定义");
            }}
          />
        </Modal>
      )}
      {dialog === "delivery" && (
        <Modal
          title="把分析，变成可以带走的成果。"
          subtitle="报告包含计算依据；分析配置可在相同数据上复现。"
          onClose={() => setDialog(null)}
        >
          <DeliveryCenter
            analysisCount={selectedReports.length}
            onPreview={previewReport}
            onHTML={exportPrintableReport}
            onMarkdown={exportMarkdown}
            onRecipe={async () => {
              download(
                "DataPilot_分析配置.json",
                await exportRecipe(
                  dataset,
                  profile,
                  scopedPlan,
                  dictionary,
                  pins,
                ),
                "application/json;charset=utf-8",
              );
            }}
            onImport={async (text) => {
              const generation = requestGeneration.current;
              const imported = await importRecipe(text, dataset, profile);
              if (generation !== requestGeneration.current)
                throw new Error("工作空间已改变，请重试导入。");
              changeScope(filtersForPlan(imported.plan));
              setDictionary(imported.dictionary);
              setPins(imported.pins);
              setActivePlan(barePlan(imported.plan));
              setView("workspace");
              setTab("charts");
              setToast("分析配置已恢复，原始数据保持不变");
            }}
          />
        </Modal>
      )}
      {dialog === "report-preview" && (
        <Modal
          className="evidence-modal"
          title="离线报告预览"
          subtitle="检查范围、图表和口径后再导出。"
          onClose={() => setDialog("delivery")}
        >
          <iframe
            title="可打印分析报告预览"
            sandbox=""
            srcDoc={reportPreview}
            style={{
              width: "100%",
              height: "65vh",
              border: "1px solid #e2eadc",
              borderRadius: 8,
            }}
          />
          <div className="kit-buttons">
            <button className="button primary" onClick={() => {
              download(`${dataset.name.replace(/\.[^.]+$/, "")}_分析报告.html`, reportPreview, "text/html;charset=utf-8");
              setToast("已生成与当前预览内容一致的 HTML 文件");
            }}>
              <Download size={14} />
              导出此 HTML 报告
            </button>
            <button
              className="button subtle"
              onClick={() => setDialog("delivery")}
            >
              返回导出中心
            </button>
          </div>
        </Modal>
      )}
      {dialog === "upload" && (
        <Modal
          title="让数据，开始新的对话。"
          subtitle="导入一份表格，数问会自动识别字段与数据类型。"
          onClose={() => setDialog(null)}
        >
          <div
            className={`upload-dropzone ${drag ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void uploadFile(e.dataTransfer.files[0]);
            }}
          >
            <span>
              <UploadCloud size={30} />
            </span>
            <h3>将文件拖到这里</h3>
            <p>支持 CSV / TSV / XLSX，兼容 UTF-8 与常见中文编码</p>
            <button
              className="button primary"
              onClick={() => fileInput.current?.click()}
            >
              选择本机文件 <ArrowRight size={14} />
            </button>
            <small>最多 {FILE_SIZE_LABEL} · 20,000 行 · 80 个字段</small>
          </div>
          {error && (
            <p className="error-message" role="alert">
              <AlertTriangle size={14} />
              {error}
            </p>
          )}
          <div className="upload-notes">
            <ShieldCheck size={18} />
            <p>
              文件保存在本机浏览器。模型模式会发送字段摘要（含部分分类值），不会发送完整数据表。导入新数据前会自动保留当前工作，可在“我的数据集”重新打开。
            </p>
          </div>
          <div className="sample-link">
            <span>还没有准备好数据？</span>
            <div className="scenario-grid">
              <button className="scenario-card" onClick={resetDemo}>
                <strong>电商经营场景</strong>
                <small>合成演示数据 · 地区销售、利润、品类分析</small>
              </button>
              <button
                className="scenario-card"
                onClick={() => {
                  void setNewDataset(campusScenario(), undefined, "diagnostics").catch(() => undefined);
                }}
              >
                <strong>校园消费场景</strong>
                <small>合成演示数据 · 场所消费、周期对比、消费贡献</small>
              </button>
            </div>
            <button className="text-button" onClick={resetDemo}>
              使用零售演示数据 <ArrowRight size={13} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="一个好问题，一次新发现。"
          subtitle="数问使用指南"
          onClose={() => setDialog(null)}
        >
          <div className="help-steps">
            {[
              [
                "01",
                "导入一份数据",
                "选择含表头的 CSV / TSV / XLSX。文件留在当前浏览器，支持最多 20,000 行。",
              ],
              [
                "02",
                "用你的话提问",
                "例如“数据概览”“质量摘要”“各地区利润合计”“改成均值”“只看华南”。本地助手按实际字段与固定规则计算；连接个人 API 后支持更灵活的表达。",
              ],
              [
                "03",
                "核对，再带走答案",
                "点击图表查看来源并继续下钻。通过字段字典补充别名与单位；导出 HTML 图表报告或分析配置，在相同数据上复现。",
              ],
            ].map(([n, title, desc]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="help-disclaimer">
            <Lightbulb size={17} />
            <p>
              系统描述统计关联，不推断因果。演示数据为程序生成的合成数据；演示意图匹配不等同于大模型推理。
            </p>
          </div>
          <button
            className="button primary full-width"
            onClick={() => {
              setDialog(null);
              setAssistant(true);
              setMobileChat(true);
              input.current?.focus();
            }}
          >
            开始我的数据探索 <ArrowRight size={15} />
          </button>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal
          title="工作空间设置"
          subtitle="清楚地知道数据在哪里，分析如何发生。"
          onClose={() => setDialog(null)}
        >
          <div className="settings-section">
            <h3>
              <Sparkles size={16} />
              分析引擎
              <span
                className={`badge ${mode === "model" ? "green" : "neutral"}`}
              >
                {mode === "model" ? "个人 API 已配置" : "本地助手"}
              </span>
            </h3>
            <p>
              {mode === "model"
                ? `当前模型：${visitorModel?.model}。请求使用你本页填写的 API 配置。`
                : "本地助手可直接统计、筛选、检查质量和查看字段，无需API。生成式知识问答和复杂规划可另行接入个人API。"}
            </p>
            <VisitorApiSettings />
          </div>
          <div className="settings-section">
            <h3>
              <ShieldCheck size={16} />
              本机数据
            </h3>
            <p>
              当前数据与分析记录保存在此浏览器的
              IndexedDB。模型模式发送字段名、类型、统计摘要及部分分类值；不会上传完整数据表。
            </p>
            <button
              className="button subtle"
              onClick={() => {
                resetDemo();
                setDialog(null);
              }}
            >
              清除上传数据并恢复演示
            </button>
          </div>
          <div className="settings-section">
            <h3>
              <Download size={16} />
              带走你的数据
            </h3>
            <button
              className="button subtle"
              onClick={() =>
                download(dataset.name, toCSV(dataset), "text/csv;charset=utf-8")
              }
            >
              导出全量 CSV
            </button>
          </div>
        </Modal>
      )}
      {dialog === "clean" && (
        <Modal
          title="让数据，更干净一点。"
          subtitle="清洗会生成新的本机副本，可撤销。分析记录、联动筛选和收藏会清空，避免混用旧口径。"
          onClose={() => setDialog(null)}
        >
          <div className="clean-options">
            <label>
              <input
                type="checkbox"
                checked={cleanOptions.deduplicate}
                onChange={(e) =>
                  setCleanOptions((v) => ({
                    ...v,
                    deduplicate: e.target.checked,
                  }))
                }
              />
              <div>
                <strong>移除完全重复记录</strong>
                <p>当前识别到 {profile.duplicates} 条，按整行内容判断。</p>
              </div>
            </label>
            <label>
              <input
                type="checkbox"
                checked={cleanOptions.trim}
                onChange={(e) =>
                  setCleanOptions((v) => ({ ...v, trim: e.target.checked }))
                }
              />
              <div>
                <strong>清理文本两端空白</strong>
                <p>保留单元格中间的空格与原始大小写。</p>
              </div>
            </label>
            <label>
              <input
                type="checkbox"
                checked={cleanOptions.fillMissing}
                onChange={(e) =>
                  setCleanOptions((v) => ({
                    ...v,
                    fillMissing: e.target.checked,
                  }))
                }
              />
              <div>
                <strong>用“未填写”标记文本空值</strong>
                <p>只标记文本字段；数值和日期保留空值，不填充 0。</p>
              </div>
            </label>
          </div>
          {cleanPreview && <section className="clean-preview" aria-label="清洗影响预览" aria-live="polite"><h3>执行前，先核对变化</h3><div className="table-overflow"><table className="data-table"><thead><tr><th>检查项</th><th>当前</th><th>清洗后</th></tr></thead><tbody>{[
            ["记录数", cleanPreview.before.rowCount, cleanPreview.after.rowCount],
            ["重复记录", cleanPreview.before.duplicates, cleanPreview.after.duplicates],
            ["缺失单元格", cleanPreview.before.missing, cleanPreview.after.missing],
            ["无效值", cleanPreview.before.fields.reduce((n, f) => n + f.invalid, 0), cleanPreview.after.fields.reduce((n, f) => n + f.invalid, 0)],
          ].map(([label, before, after]) => <tr key={label}><th>{label}</th><td>{Number(before).toLocaleString()}</td><td>{Number(after).toLocaleString()}</td></tr>)}</tbody></table></div><p>先清理空白、标记文本空值，再按处理后的整行内容去重。本次移除 {cleanPreview.removed} 条记录；去重前修整 {cleanPreview.trimmed} 个单元格、标记 {cleanPreview.filled} 个文本空值。</p><p>无效值需人工核对；字段类型保持不变。文本标记仅改善可读性，不代表找回缺失信息。</p>{!cleanPreview.changed && <strong>当前选项不会改变数据，无需执行。</strong>}</section>}
          <button className="button primary full-width" onClick={applyClean} disabled={!cleanPreview?.changed}>
            <WandSparkles size={16} />
            执行清洗
          </button>
        </Modal>
      )}
    </div>
    </>
  );
}
