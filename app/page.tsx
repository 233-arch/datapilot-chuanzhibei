"use client";
import {
  useState,
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
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell as PieCell,
  Brush,
} from "recharts";
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
  cleanDataset,
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
import { readWorkspace, writeWorkspace } from "@/lib/local-store";
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
type Tab =
  | "overview"
  | "preview"
  | "quality"
  | "lab"
  | "diagnostics"
  | "intelligence";
type View = "workspace" | "datasets" | "reports";
type Dialog =
  | "upload"
  | "help"
  | "settings"
  | "clean"
  | "evidence"
  | "dictionary"
  | "delivery"
  | "report-preview"
  | null;
const colors = [
  "#118a74",
  "#6cba9d",
  "#b2d5a1",
  "#d6b778",
  "#8c9fba",
  "#b2a0c7",
];
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
  link.download = name;
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
function DataChart({
  plan,
  result,
  small = false,
  onPointClick,
  onRange,
}: {
  plan: Plan;
  result: AnalysisResult;
  small?: boolean;
  onPointClick?: (name: string) => void;
  onRange?: (start: string, end: string) => void;
}) {
  const [range, setRange] = useState<{
    startIndex?: number;
    endIndex?: number;
  } | null>(null);
  useEffect(() => setRange(null), [result, plan]);
  if (!result.points.length)
    return (
      <div className="chart-empty">
        <Search size={28} />
        <p>没有符合条件的数据</p>
        <span>试试调整筛选或分析指标</span>
      </div>
    );
  if (plan.chart === "pie" && result.points.some((point) => point.value < 0))
    return (
      <div className="chart-empty">
        <BarChart3 size={28} />
        <p>当前指标含负值，不适合用饼图表达占比</p>
        <span>请切换柱状图或折线图查看完整结果</span>
      </div>
    );
  if (plan.chart === "pie" && result.points.every((point) => point.value === 0))
    return (
      <div className="chart-empty">
        <BarChart3 size={28} />
        <p>当前聚合值均为 0，暂无可显示的占比</p>
        <span>可切换柱状图查看各组数据</span>
      </div>
    );
  const props = {
    data: result.points,
    margin: { top: 15, right: 12, bottom: 5, left: 0 },
  };
  const label = plan.aggregate === "count" ? "记录数" : plan.metric;
  const tooltip = (
    <Tooltip
      contentStyle={{
        border: "1px solid #e5eae6",
        borderRadius: 10,
        fontSize: 13,
        boxShadow: "0 6px 24px #173e2912",
      }}
      formatter={(v) => [`${formatNumber(Number(v))}${result.unit}`, label]}
      labelStyle={{ color: "#68766d", marginBottom: 6 }}
      cursor={{ fill: "#f1f6f3", stroke: "#c7d9cf" }}
    />
  );
  return (
    <div
      className={`chart-wrap ${small ? "small-chart" : ""}`}
      role="group"
      aria-label={`${plan.title}。${result.summary}`}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={160}
        initialDimension={{ width: 320, height: small ? 180 : 226 }}
      >
        {plan.chart === "pie" ? (
          <PieChart>
            <Pie
              data={result.points}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={small ? 48 : 62}
              outerRadius={small ? 72 : 92}
              paddingAngle={3}
              stroke="none"
              onClick={(_point, index) => {
                const point = result.points[index];
                if (point) onPointClick?.(point.name);
              }}
            >
              {result.points.map((_, i) => (
                <PieCell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            {tooltip}
          </PieChart>
        ) : plan.chart === "line" ? (
          <AreaChart {...props}>
            <defs>
              <linearGradient
                id={small ? "areaSmall" : "areaMain"}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#109177" stopOpacity={0.19} />
                <stop offset="95%" stopColor="#109177" stopOpacity={0.015} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 5"
              vertical={false}
              stroke="#e9eeea"
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tickMargin={12}
              tick={{ fontSize: 13, fill: "#929b94" }}
              tickFormatter={(s) =>
                /^\d{4}-\d{2}$/.test(s)
                  ? `${Number(s.slice(5))}月`
                  : String(s).slice(0, 12)
              }
            />
            <YAxis
              width={52}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 13, fill: "#929b94" }}
              tickFormatter={(n) =>
                Math.abs(n) >= 10000
                  ? `${Math.round(n / 10000)}万`
                  : formatNumber(n, true)
              }
            />
            {tooltip}
            {onRange && (
              <Brush
                dataKey="name"
                height={24}
                stroke="#8bbba4"
                travellerWidth={10}
                onChange={(value) => setRange(value)}
                tickFormatter={(v) => String(v).slice(0, 10)}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke="#0e8d75"
              strokeWidth={2.7}
              fill={`url(#${small ? "areaSmall" : "areaMain"})`}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 3 }}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <BarChart {...props}>
            <CartesianGrid
              strokeDasharray="3 5"
              vertical={false}
              stroke="#e9eeea"
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fontSize: 13, fill: "#87928a" }}
              interval={0}
              tickFormatter={(s) => String(s).slice(0, 7)}
            />
            <YAxis
              width={48}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 13, fill: "#929b94" }}
              tickFormatter={(n) => formatNumber(n, true)}
            />
            {tooltip}
            <Bar
              dataKey="value"
              maxBarSize={small ? 30 : 50}
              radius={[4, 4, 0, 0]}
              fill="#118a74"
              isAnimationActive={false}
              onClick={(_point, index) => {
                const point = result.points[index];
                if (point) onPointClick?.(point.name);
              }}
            >
              {result.points.map((_, i) => (
                <PieCell
                  key={i}
                  fill={i === 0 ? "#118a74" : i % 2 ? "#85bfa8" : "#add2bd"}
                />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
      {onRange && plan.chart === "line" && range && (
        <div className="range-apply">
          <button
            className="button subtle"
            onClick={() => {
              const a = result.points[range.startIndex ?? 0]?.name,
                b =
                  result.points[range.endIndex ?? result.points.length - 1]
                    ?.name;
              if (a && b) onRange(a, b);
            }}
          >
            应用选中的时间范围
          </button>
        </div>
      )}
    </div>
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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = panel.current?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
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
  }, [onClose]);
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [assistant, setAssistant] = useState(true);
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
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
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
  const qualityIssues = quality.issues;
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
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? scopeDataset.rows.filter((r) =>
          dataset.columns.some((c) =>
            String(r[c] ?? "")
              .toLowerCase()
              .includes(q),
          ),
        )
      : scopeDataset.rows;
  }, [scopeDataset, search]);
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
    readWorkspace<{
      dataset: Dataset;
      entries: Entry[];
      pins?: PinnedInsight[];
      filters?: FilterClause[];
      plan?: Plan;
      dictionary?: Dictionary;
      journey?: JourneyState;
      tools?: WorkspaceTools;
      tab?: Tab;
    }>()
      .then(async (value) => {
        if (
          alive &&
          value?.dataset?.columns?.length &&
          value.dataset.rows?.length
        ) {
          const p = await backgroundTask<Profile>("profile", value.dataset);
          if (!alive) return;
          setPreparedProfile({ id: value.dataset.id, profile: p });
          setDataset(value.dataset);
          setTools(restoreTools(value.tools, value.dataset, p));
          if (
            [
              "overview",
              "preview",
              "quality",
              "lab",
              "diagnostics",
              "intelligence",
            ].includes(value.tab || "")
          )
            setTab(value.tab!);
          setJourney(restoreJourney(value.journey, value.dataset.id, p));
          setActivePlan(defaultPlan(p));
          setEntries(value.entries || []);
          try {
            setDictionary(
              validateDictionary(value.dictionary || {}, value.dataset.columns),
            );
          } catch {
            setDictionary({});
          }
          try {
            validateFilters(value.filters || [], p.fields);
            setScopeFilters(value.filters || []);
          } catch {
            setScopeFilters([]);
          }
          setPins(
            (value.pins || [])
              .filter((pin) => {
                try {
                  validatePlan(pin.plan, p);
                  return (
                    typeof pin.name === "string" && typeof pin.note === "string"
                  );
                } catch {
                  return false;
                }
              })
              .slice(0, 12),
          );
          if (value.plan) {
            try {
              validatePlan(value.plan, p);
              setActivePlan(barePlan(value.plan));
            } catch {}
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);
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
  useEffect(() => {
    if (!ready) return;
    setSaved(false);
    const id = setTimeout(() => {
      writeWorkspace({
        dataset,
        entries,
        pins,
        filters: scopeFilters,
        plan: activePlan,
        dictionary,
        journey,
        tools,
        tab,
      })
        .then(() => setSaved(true))
        .catch(() => setSaved(false));
    }, 300);
    return () => clearTimeout(id);
  }, [
    dataset,
    entries,
    pins,
    scopeFilters,
    activePlan,
    dictionary,
    journey,
    tools,
    tab,
    ready,
  ]);
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
  function setNewDataset(next: Dataset, prepared?: Profile) {
    setPreparedProfile(prepared ? { id: next.id, profile: prepared } : null);
    setClarification(null);
    setPendingFile(null);
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
    setSearch("");
    setPage(1);
    setTab("overview");
    setView("workspace");
    setDialog(null);
    setError("");
    setToast(`已载入 ${next.rows.length.toLocaleString()} 条记录`);
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
    const analyses = [
      ...entries.map(({ plan, result }) => ({ plan, result })),
      { plan: scopedPlan, result },
    ];
    if (!entries.length)
      analyses.push(
        {
          plan: { ...secondaryPlan, filters: scopeFilters },
          result: secondary,
        },
        { plan: { ...categoryPlan, filters: scopeFilters }, result: category },
      );
    const unique = analyses.filter(
      (a, i) =>
        analyses.findIndex(
          (b) => JSON.stringify(b.plan) === JSON.stringify(a.plan),
        ) === i,
    );
    download(
      `${dataset.name.replace(/\.[^.]+$/, "")}_分析报告.md`,
      reportMarkdown(dataset, profile, unique),
      "text/markdown;charset=utf-8",
    );
    setToast("分析报告已导出，包含统计结果与计算口径");
  }
  function printableReport() {
    const analyses = [
      { plan: scopedPlan },
      ...pins.map((p) => ({ plan: p.plan, note: p.note })),
      ...entries.map(({ plan, mode }) => ({ plan, mode })),
    ];
    const unique = analyses.filter(
      (a, i) =>
        analyses.findIndex(
          (b) => JSON.stringify(b.plan) === JSON.stringify(a.plan),
        ) === i,
    );
    return reportHTML(dataset, profile, unique, dictionary);
  }
  function exportPrintableReport() {
    download(
      `${dataset.name.replace(/\.[^.]+$/, "")}_分析报告.html`,
      printableReport(),
      "text/html;charset=utf-8",
    );
    setToast("HTML 报告已生成，可离线打开并打印为 PDF");
  }
  async function ask(text = question) {
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
          if (previewFirst) setProposal(next); else commitProposal(next);
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
    setTab("overview");
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
            if (previewFirst) setProposal(next);
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
    const next = cleanDataset(dataset, cleanOptions);
    setTools(defaultTools(next, profileDataset(next)));
    setPreparedProfile(null);
    setDataset(next);
    setActivePlan(defaultPlan(profileDataset(next)));
    setEntries([]);
    setPage(1);
    setDialog(null);
    setToast(
      `清洗完成：保留 ${next.rows.length.toLocaleString()} 条记录，可撤销本次操作`,
    );
  }
  function resetDemo() {
    setNewDataset(makeDemo());
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
    setPage(1);
  }
  function updateChartControls(patch: Partial<Plan>) {
    setActivePlan((previous) => {
      const next = { ...previous, ...patch };
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
    setTab("overview");
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
    setTab("overview");
    setPage(1);
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
  return (
    <div
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
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setView("workspace");
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
        <div className="nav-caption">工作空间</div>
        <nav aria-label="主导航">
          <button aria-label="分析工作台" title="分析工作台"
            className={
              view === "workspace" && tab !== "lab"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => {
              setView("workspace");
              setTab("overview");
            }}
          >
            <LayoutDashboard size={18} />
            分析工作台
          </button>
          <button aria-label="我的数据集" title="我的数据集"
            className={view === "datasets" ? "nav-item active" : "nav-item"}
            onClick={() => setView("datasets")}
          >
            <Database size={18} />
            我的数据集
          </button>
          <button aria-label="创新实验室" title="创新实验室"
            className={
              view === "workspace" && tab === "lab"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => {
              setView("workspace");
              setTab("lab");
            }}
          >
            <FlaskConical size={18} />
            创新实验室
          </button>
          <button aria-label="洞察报告" title="洞察报告"
            className={view === "reports" ? "nav-item active" : "nav-item"}
            onClick={() => setView("reports")}
          >
            <FileText size={18} />
            洞察报告
            {entries.length > 0 && (
              <span className="nav-count">{entries.length}</span>
            )}
          </button>
        </nav>
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
        {entries.length > 0 && (
          <>
            <div className="sidebar-section-title">
              <span>最近分析</span>
              <History size={14} />
            </div>
            <div className="recent-list">
              {entries
                .slice(-3)
                .reverse()
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      openAnalysis(e.plan);
                      setView("workspace");
                      setTab("overview");
                    }}
                  >
                    <MessageSquare size={14} />
                    <span>{e.question}</span>
                  </button>
                ))}
            </div>
          </>
        )}
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setDialog("settings")}>
            <Settings2 size={17} />
            工作空间设置
          </button>
          <button className="nav-item" onClick={() => setDialog("dictionary")}>
            <BookOpen size={18} />
            <span>字段字典</span>
          </button>
          <button className="nav-item" onClick={() => setDialog("help")}>
            <CircleHelp size={17} />
            使用帮助
            <ArrowUpRight size={13} className="push-right" />
          </button>
        </div>
      </aside>
      <section className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>
              {view === "workspace"
                ? (tab === "lab" ? "创新实验室" : "分析工作台")
                : view === "datasets"
                  ? "我的数据集"
                  : "洞察报告"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="save-status">
              <span className={saved ? "status-dot" : ""} />
              {saved ? "已保存在本机" : "本地工作空间"}
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
              <Settings2 size={17} /> 设置与 API
            </button>
          </div>
        </header>
        <div className="content-shell">
          <main className="workspace-content">
            <div className="page-heading">
              <div>
                <h1>
                  {view === "workspace"
                    ? (tab === "lab" ? "创新实验室" : "数据分析工作台")
                    : view === "datasets"
                      ? "我的数据集"
                      : "洞察报告"}
                </h1>
                <p>
                  {view === "workspace"
                    ? "导入表格、核对指标，用图表和分析助手探索数据。"
                    : view === "datasets"
                      ? "数据保存在当前浏览器，随时探索、清洗和导出。"
                      : "回顾分析过程，带着可信的结果继续前进。"}
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
            {view === "workspace" && (
              <>
                <FilterBar
                  dataset={dataset}
                  profile={profile}
                  filters={scopeFilters}
                  count={scopeDataset.rows.length}
                  onChange={changeScope}
                />
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
                <div className="workspace-tabs">
                  <div role="tablist" aria-label="数据分析视图">
                    <button
                      role="tab"
                      aria-selected={tab === "overview"}
                      className={tab === "overview" ? "selected" : ""}
                      onClick={() => setTab("overview")}
                    >
                      <BarChart3 size={15} />
                      数据概览
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "preview"}
                      className={tab === "preview" ? "selected" : ""}
                      onClick={() => setTab("preview")}
                    >
                      <Table2 size={15} />
                      数据预览
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "quality"}
                      className={tab === "quality" ? "selected" : ""}
                      onClick={() => setTab("quality")}
                    >
                      <ShieldCheck size={15} />
                      质量检查
                      {qualityIssues > 0 && <span className="tiny-count">{qualityIssues}</span>}
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "diagnostics"}
                      className={tab === "diagnostics" ? "selected" : ""}
                      onClick={() => setTab("diagnostics")}
                    >
                      <Activity size={15} />
                      业务诊断
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "intelligence"}
                      className={tab === "intelligence" ? "selected" : ""}
                      onClick={() => setTab("intelligence")}
                    >
                      <Sparkles size={15} />
                      智能分析
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "lab"}
                      className={tab === "lab" ? "selected" : ""}
                      onClick={() => setTab("lab")}
                    >
                      <FlaskConical size={15} />
                      创新实验室
                    </button>
                  </div>
                </div>
                {tab === "overview" && (
                  <>
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
                            ? "基于当前数据集计算"
                            : "当前数据集全部记录"}
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
                          <span>数据完整率</span>
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
                    <div className="chart-section-heading">
                      <div>
                        <h2>探索数据</h2>
                        <span>从全局趋势，看到每一个细节</span>
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
                    <section className="chart-card main-chart-card">
                      <div className="card-heading">
                        <div>
                          <h3>{activePlan.title}</h3>
                          <p>
                            {activePlan.groupBy} ·{" "}
                            {activePlan.aggregate === "sum"
                              ? "求和"
                              : activePlan.aggregate === "mean"
                                ? "平均值"
                                : activePlan.aggregate === "count"
                                  ? "记录计数"
                                  : activePlan.aggregate === "max"
                                    ? "最大值"
                                    : "最小值"}
                            {activePlan.filter
                              ? ` · ${activePlan.filter.field} = ${activePlan.filter.value}`
                              : ""}
                          </p>
                        </div>
                        <div className="card-tools">
                          <button
                            className="icon-button pin-current"
                            aria-label="收藏当前分析"
                            title="收藏当前分析口径"
                            onClick={pinCurrent}
                          >
                            <Bookmark size={16} />
                          </button>
                          <div className="segmented" aria-label="图表类型">
                            {(["line", "bar", "pie"] as const).map((c) => (
                              <button
                                key={c}
                                className={
                                  activePlan.chart === c ? "selected" : ""
                                }
                                aria-label={
                                  c === "line"
                                    ? "折线图"
                                    : c === "bar"
                                      ? "柱状图"
                                      : "饼图"
                                }
                                onClick={() =>
                                  updateChartControls({ chart: c })
                                }
                              >
                                {c === "line" ? (
                                  <TrendingUp size={14} />
                                ) : c === "bar" ? (
                                  <BarChart3 size={14} />
                                ) : (
                                  <span className="pie-icon" />
                                )}
                                <span>{c === "line" ? "折线" : c === "bar" ? "柱状" : "饼图"}</span>
                              </button>
                            ))}
                          </div>
                          <button
                            className="icon-button"
                            aria-label="查看计算口径"
                            onClick={() => setShowSQL(!showSQL)}
                          >
                            <Code2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="chart-controls">
                        <label>
                          维度
                          <select
                            value={activePlan.groupBy}
                            onChange={(e) =>
                              updateChartControls({
                                groupBy: e.target.value,
                                sort:
                                  profile.fields.find(
                                    (f) => f.name === e.target.value,
                                  )?.type === "date"
                                    ? "natural"
                                    : "desc",
                              })
                            }
                          >
                            {profile.fields.map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {activePlan.aggregate !== "count" && (
                        <label>
                          指标
                          <select
                            value={activePlan.metric}
                            onChange={(e) =>
                              updateChartControls({ metric: e.target.value })
                            }
                          >
                            {metrics.length ? (
                              metrics.map((f) => (
                                <option key={f.name} value={f.name}>
                                  {f.name}
                                </option>
                              ))
                            ) : (
                              <option value="">记录数</option>
                            )}
                          </select>
                        </label>
                        )}
                        <label className="aggregate-control">
                          统计方式
                          <select
                            aria-label="聚合方式"
                            value={activePlan.aggregate}
                            onChange={(e) =>
                              updateChartControls({ aggregate: e.target.value as Plan["aggregate"] })
                            }
                          >
                            <option value="count">计数</option>
                            {metrics.length > 0 && (
                              <>
                                <option value="sum">求和</option>
                                <option value="mean">均值</option>
                                <option value="max">最大值</option>
                                <option value="min">最小值</option>
                              </>
                            )}
                          </select>
                        </label>
                        {activePlan.filter && (
                          <button
                            className="filter-chip"
                            onClick={() =>
                              setActivePlan((p) => ({
                                ...p,
                                filter: undefined,
                              }))
                            }
                          >
                            {activePlan.filter.value}
                            <X size={11} />
                          </button>
                        )}
                        <span className="chart-unit">
                          单位：{result.unit || "数值"}
                        </span>
                      </div>
                      <details className="chart-advanced"><summary>排序与时间设置</summary>
                      <div className="explore-chart-options">
                        <label>
                          排序
                          <select
                            aria-label="图表排序"
                            value={activePlan.sort}
                            onChange={(e) =>
                              setActivePlan((p) => ({
                                ...p,
                                sort: e.target.value as Plan["sort"],
                              }))
                            }
                          >
                            <option value="desc">从高到低</option>
                            <option value="asc">从低到高</option>
                            <option value="natural">按维度顺序</option>
                          </select>
                        </label>
                        <label>
                          展示
                          <select
                            aria-label="展示分组数量"
                            value={activePlan.limit}
                            onChange={(e) =>
                              setActivePlan((p) => ({
                                ...p,
                                limit: Number(e.target.value),
                              }))
                            }
                          >
                            {[...new Set([activePlan.limit, 5, 10, 12, 20, 30])]
                              .sort((a, b) => a - b)
                              .map((n) => (
                                <option key={n} value={n}>
                                  前 {n} 组
                                </option>
                              ))}
                          </select>
                        </label>
                        {profile.fields.find(
                          (f) => f.name === activePlan.groupBy,
                        )?.type === "date" && (
                          <label>
                            时间粒度
                            <select
                              aria-label="时间粒度"
                              value={activePlan.timeGrain}
                              onChange={(e) =>
                                updateChartControls({ timeGrain: e.target.value as Plan["timeGrain"] })
                              }
                            >
                              <option value="month">按月</option>
                              <option value="day">按日</option>
                            </select>
                          </label>
                        )}
                        <span>
                          <MousePointer2 size={11} />
                          点击柱形或分组追溯明细
                        </span>
                      </div>
                      </details>
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
                        <div className="sql-panel">
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
                    </section>
                    <div className="small-chart-grid">
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
                          <span className="push-right">点击右上角展开</span>
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
                        <div className="donut-layout">
                          <DataChart
                            plan={categoryPlan}
                            result={category}
                            small
                            onPointClick={(name) =>
                              inspectGroup(categoryPlan, name)
                            }
                          />
                          <div className="donut-legend">
                            {category.points.slice(0, 5).map((p, i) => (
                              <div key={p.name}>
                                <span
                                  style={{
                                    background: colors[i % colors.length],
                                  }}
                                />
                                <span>{p.name}</span>
                                <strong>{formatNumber(p.value, true)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="chart-footer">
                          显示实际聚合结果
                          <span className="push-right">
                            {category.points.length} 个分组
                          </span>
                        </div>
                      </section>
                    </div>
                    <section className="next-step">
                      <span>
                        <Sparkles size={19} />
                      </span>
                      <div>
                        <strong>数据里，还有更多值得问的问题。</strong>
                        <p>试试问：“{starters[1]}”</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => void ask(starters[1])}
                        disabled={busy}
                      >
                        立即探索 <ArrowRight size={14} />
                      </button>
                    </section>
                  </>
                )}
                {tab === "overview" && (
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
                {tab === "preview" && (
                  <section className="table-card">
                    <div className="card-heading">
                      <div>
                        <h3>原始数据预览</h3>
                        <p>保留数据原貌，所有分析均可追溯</p>
                      </div>
                      <button
                        className="button subtle"
                        onClick={() =>
                          download(
                            dataset.name,
                            toCSV(dataset),
                            "text/csv;charset=utf-8",
                          )
                        }
                      >
                        <Download size={14} />
                        导出全量 CSV
                      </button>
                    </div>
                    <div className="table-toolbar">
                      <div className="search-box">
                        <Search size={15} />
                        <input
                          aria-label="搜索数据"
                          placeholder="搜索任意字段值…"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                          }}
                        />
                      </div>
                      <span>{filteredRows.length.toLocaleString()} 条记录</span>
                    </div>
                    <div className="table-overflow">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="row-index">#</th>
                            {profile.fields.map((f) => (
                              <th key={f.name}>
                                {f.type === "number" ? (
                                  <Hash size={12} />
                                ) : f.type === "date" ? (
                                  <CalendarDays size={12} />
                                ) : (
                                  <span className="field-text-icon">Aa</span>
                                )}
                                {f.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRows
                            .slice((page - 1) * 12, page * 12)
                            .map((r, i) => (
                              <tr key={i}>
                                <td className="row-index">
                                  {(page - 1) * 12 + i + 1}
                                </td>
                                {dataset.columns.map((c) => (
                                  <td
                                    key={c}
                                    title={String(r[c] ?? "")}
                                    className={
                                      r[c] === null ? "missing-cell" : ""
                                    }
                                  >
                                    {r[c] === null ? (
                                      <span>空值</span>
                                    ) : (
                                      String(r[c])
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!filteredRows.length && (
                        <div className="table-empty">
                          没有匹配的数据，试试其他关键词。
                        </div>
                      )}
                    </div>
                    <div className="pagination">
                      <span>
                        第 {Math.min((page - 1) * 12 + 1, filteredRows.length)}—
                        {Math.min(page * 12, filteredRows.length)} 条，共{" "}
                        {filteredRows.length} 条
                      </span>
                      <div>
                        <button
                          className="button subtle"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          上一页
                        </button>
                        <span>
                          {page} /{" "}
                          {Math.max(1, Math.ceil(filteredRows.length / 12))}
                        </span>
                        <button
                          className="button subtle"
                          disabled={page >= Math.ceil(filteredRows.length / 12)}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  </section>
                )}
                {tab === "quality" && (
                  <>
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
                    <section className="table-card">
                      <div className="card-heading">
                        <div>
                          <h3>字段质量详情</h3>
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
                              <th>无效数值</th>
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
                                        width: `${100 * (1 - f.missing / profile.rowCount)}%`,
                                      }}
                                    />
                                  </div>
                                  {(
                                    100 *
                                    (1 - f.missing / profile.rowCount)
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
              </>
            )}
            {view === "datasets" && (
              <>
                <section className="dataset-library-card chart-card">
                  <div className="large-file-icon">
                    <FileSpreadsheet size={36} />
                  </div>
                  <div>
                    <span className="badge green">当前数据集</span>
                    <h2>{dataset.name}</h2>
                    <p>
                      {profile.rowCount.toLocaleString()} 条记录 ·{" "}
                      {profile.columnCount} 个字段 ·{" "}
                      {dataset.source === "demo" ? "合成演示数据" : "本机文件"}
                    </p>
                    <div className="dataset-library-actions">
                      <button
                        className="button primary"
                        onClick={() => {
                          setView("workspace");
                          setTab("overview");
                        }}
                      >
                        开始分析 <ArrowRight size={14} />
                      </button>
                      <button
                        className="button subtle"
                        onClick={() =>
                          download(
                            dataset.name,
                            toCSV(dataset),
                            "text/csv;charset=utf-8",
                          )
                        }
                      >
                        <Download size={14} />
                        下载数据
                      </button>
                    </div>
                  </div>
                </section>
                <div
                  className="import-card"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e: DragEvent) => {
                    e.preventDefault();
                    void uploadFile(e.dataTransfer.files[0]);
                  }}
                >
                  <UploadCloud size={30} />
                  <h3>让下一份数据，也开口说话。</h3>
                  <p>
                    拖入 CSV / TSV / XLSX，或点击选择文件。最多 {FILE_SIZE_LABEL}、20,000
                    行。
                  </p>
                  <button
                    className="button subtle"
                    onClick={() => {
                      setDialog("upload");
                      setError("");
                    }}
                  >
                    选择文件 <Plus size={14} />
                  </button>
                  <small>导入新文件会替换当前工作空间的数据与分析记录</small>
                </div>
                <div className="privacy-note">
                  <ShieldCheck size={16} />
                  <span>
                    上传文件保存在当前浏览器。模型模式仅发送字段摘要与统计信息，不发送完整数据表。
                  </span>
                </div>
              </>
            )}
            {view === "reports" && (
              <>
                <div className="report-toolbar">
                  <span>
                    {entries.length
                      ? `已保存 ${entries.length} 次分析`
                      : "从一次提问，积累一份洞察"}
                  </span>
                  <button className="button primary" onClick={exportReport}>
                    <Download size={15} />
                    导出完整报告
                  </button>
                </div>
                {entries.length ? (
                  <div className="report-list">
                    {[...entries].reverse().map((entry, i) => (
                      <article
                        className="chart-card report-card"
                        key={entry.id}
                      >
                        <div className="report-number">
                          {String(entries.length - i).padStart(2, "0")}
                        </div>
                        <div>
                          <span className="eyebrow">
                            {entry.mode === "model"
                              ? "模型规划 · 本地计算"
                              : "本地规则 · 本地计算"}
                          </span>
                          <h3>{entry.question}</h3>
                          <p>{entry.result.summary}</p>
                          <div className="source-actions">
                            <button
                              onClick={() => {
                                setEvidence({
                                  title: entry.plan.title + " · 来源记录",
                                  dataset: filterDataset(
                                    dataset,
                                    filtersForPlan(entry.plan),
                                  ),
                                });
                                setEvidenceFilter(null);
                                setDialog("evidence");
                              }}
                            >
                              查看来源记录
                            </button>
                            <button
                              onClick={() => {
                                openAnalysis(entry.plan);
                                setTab("diagnostics");
                                setMobileChat(false);
                              }}
                            >
                              比较周期与贡献
                            </button>
                          </div>
                          <div className="report-tags">
                            <span>{entry.plan.groupBy}</span>
                            <span>
                              {entry.plan.aggregate === "count"
                                ? "记录数"
                                : entry.plan.metric}
                            </span>
                            <span>{entry.result.validRows} 条参与计算</span>
                          </div>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`查看${entry.plan.title}`}
                          onClick={() => {
                            openAnalysis(entry.plan);
                            setView("workspace");
                            setTab("overview");
                          }}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state chart-card">
                    <BookOpen size={44} />
                    <h2>你的第一份洞察，即将诞生。</h2>
                    <p>向右侧助手提出一个问题，分析结果会自动保存在这里。</p>
                    <button
                      className="button primary"
                      onClick={() => void ask(starters[0])}
                      disabled={busy}
                    >
                      探索当前数据 <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
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
                    <div className="assistant-intro">
                      <div className="intro-orbit">
                        <Brand />
                      </div>
                      <h2>从一个问题开始</h2>
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
                              setTab("overview");
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
          {
            <button
              className={`assistant-fab ${assistant ? "mobile-only" : ""}`}
              onClick={() => {
                setAssistant(true);
                setMobileChat(true);
              }}
            >
              <Sparkles size={18} />
              分析助手
              <PanelRightOpen size={16} />
            </button>
          }
        </div>
      </section>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {dialog === "evidence" && evidence && (
        <Modal
          className="evidence-modal"
          title={evidence.title}
          subtitle="图表背后的每条记录，都可检查。"
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
            onPreview={() => {
              setReportPreview(printableReport());
              setDialog("report-preview");
            }}
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
              setTab("overview");
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
            <button className="button primary" onClick={exportPrintableReport}>
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
              文件保存在本机浏览器。模型模式会发送字段摘要（含部分分类值），不会发送完整数据表。导入新数据会替换当前工作空间。
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
                  setNewDataset(campusScenario());
                  setTab("diagnostics");
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
                <strong>用“未填写”标记空值</strong>
                <p>仅用于明确缺失状态，不填充 0，不虚构数据。</p>
              </div>
            </label>
          </div>
          <button className="button primary full-width" onClick={applyClean}>
            <WandSparkles size={16} />
            执行清洗
          </button>
        </Modal>
      )}
    </div>
  );
}
