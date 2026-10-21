"use client";
import {
  useState,
  useMemo,
  useEffect,
  useRef,
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
  LIMITS,
} from "@/lib/data-engine";
import { readWorkspace, writeWorkspace } from "@/lib/local-store";
type Entry = {
  id: string;
  question: string;
  plan: Plan;
  result: AnalysisResult;
  mode: "model" | "demo";
  retrieved: string[];
};
type Tab = "overview" | "preview" | "quality";
type View = "workspace" | "datasets" | "reports";
type Dialog = "upload" | "help" | "settings" | "clean" | null;
const colors = [
  "#118a74",
  "#6cba9d",
  "#b2d5a1",
  "#d6b778",
  "#8c9fba",
  "#b2a0c7",
];
const initialDataset = makeDemo();
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
}: {
  plan: Plan;
  result: AnalysisResult;
  small?: boolean;
}) {
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
        fontSize: 12,
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
      role="img"
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
              tick={{ fontSize: 11, fill: "#929b94" }}
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
              tick={{ fontSize: 10, fill: "#929b94" }}
              tickFormatter={(n) =>
                Math.abs(n) >= 10000
                  ? `${Math.round(n / 10000)}万`
                  : formatNumber(n, true)
              }
            />
            {tooltip}
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
              tick={{ fontSize: 11, fill: "#87928a" }}
              interval={0}
              tickFormatter={(s) => String(s).slice(0, 7)}
            />
            <YAxis
              width={48}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#929b94" }}
              tickFormatter={(n) => formatNumber(n, true)}
            />
            {tooltip}
            <Bar
              dataKey="value"
              maxBarSize={small ? 30 : 50}
              radius={[4, 4, 0, 0]}
              fill="#118a74"
              isAnimationActive={false}
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
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
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
        className="modal"
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [view, setView] = useState<View>("workspace");
  const [tab, setTab] = useState<Tab>("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activePlan, setActivePlan] = useState<Plan>(() =>
    defaultPlan(profileDataset(initialDataset)),
  );
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [mode, setMode] = useState<"demo" | "model">("demo");
  const [modelName, setModelName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [assistant, setAssistant] = useState(true);
  const [mobileChat, setMobileChat] = useState(false);
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
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const chatBottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const profile = useMemo(() => profileDataset(dataset), [dataset]);
  const result = useMemo(() => {
    try {
      return executePlan(dataset, profile, activePlan);
    } catch {
      return executePlan(dataset, profile, defaultPlan(profile));
    }
  }, [dataset, profile, activePlan]);
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
    () => executePlan(dataset, profile, secondaryPlan),
    [dataset, profile, secondaryPlan],
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
    () => executePlan(dataset, profile, categoryPlan),
    [dataset, profile, categoryPlan],
  );
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? dataset.rows.filter((r) =>
          dataset.columns.some((c) =>
            String(r[c] ?? "")
              .toLowerCase()
              .includes(q),
          ),
        )
      : dataset.rows;
  }, [dataset, search]);
  const metricSparkPath = useMemo(() => {
    const values = executePlan(
      dataset,
      profile,
      defaultPlan(profile),
    ).points.map((p) => p.value);
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
  }, [dataset, profile]);
  const sumField = (field?: string) =>
    field
      ? dataset.rows.reduce((sum, r) => sum + (numeric(r[field]) ?? 0), 0)
      : 0;
  const primaryMetric =
    metrics.find((f) => /销售额|收入|sales|revenue/i.test(f.name)) ||
    metrics[0];
  const profitMetric =
    metrics.find((f) => /利润|profit/i.test(f.name)) || metrics[1];
  const starters = useMemo(() => {
    const date = profile.fields.find((f) => f.type === "date");
    const m = metrics[0]?.name;
    const dims = dimensions.filter((f) => f.type === "text" && f.unique < 30);
    return [
      date
        ? `按月查看${m || "记录数"}趋势`
        : `按${dims[0]?.name || profile.fields[0].name}统计记录数`,
      dims[0]
        ? `哪个${dims[0].name}的${m || "记录数"}最高？`
        : "统计每个分组的记录数",
      dims[1]
        ? `分析${dims[1].name}的${m || "记录数"}占比`
        : `按${dims[0]?.name || profile.fields[0].name}统计记录数`,
    ];
  }, [profile]);
  useEffect(() => {
    let alive = true;
    readWorkspace<{ dataset: Dataset; entries: Entry[] }>()
      .then((value) => {
        if (
          alive &&
          value?.dataset?.columns?.length &&
          value.dataset.rows?.length
        ) {
          const p = profileDataset(value.dataset);
          setDataset(value.dataset);
          setActivePlan(defaultPlan(p));
          setEntries(value.entries || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    fetch("/api/analyze")
      .then((r) => r.json() as Promise<{ mode: string; model: string | null }>)
      .then((value) => {
        if (alive) {
          setMode(value.mode === "model" ? "model" : "demo");
          setModelName(value.model);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved(false);
    const id = setTimeout(() => {
      writeWorkspace({ dataset, entries })
        .then(() => setSaved(true))
        .catch(() => setSaved(false));
    }, 300);
    return () => clearTimeout(id);
  }, [dataset, entries, ready]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    chatBottom.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [entries, busy, steps]);
  function setNewDataset(next: Dataset) {
    requestGeneration.current++;
    abort.current?.abort();
    setBusy(false);
    setSteps([]);
    setDataset(next);
    setActivePlan(defaultPlan(profileDataset(next)));
    setEntries([]);
    setUndo(null);
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
    if (file.size > LIMITS.bytes) {
      setError("文件超过 5 MB，请精简后重试。");
      return;
    }
    if (!/\.(csv|tsv)$/i.test(file.name)) {
      setError("请上传 CSV 或 TSV 文件。Excel 可另存为 CSV 后上传。");
      return;
    }
    try {
      let text = await file.text();
      if (text.includes("\uFFFD")) {
        text = new TextDecoder("gb18030").decode(await file.arrayBuffer());
      }
      setNewDataset(parseCSV(text, file.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法读取文件，请检查格式。");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function exportReport() {
    const analyses = [
      ...entries.map(({ plan, result }) => ({ plan, result })),
      { plan: activePlan, result },
    ];
    if (!entries.length)
      analyses.push(
        { plan: secondaryPlan, result: secondary },
        { plan: categoryPlan, result: category },
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
  async function ask(text = question) {
    const q = text.trim();
    if (!q || busy) return;
    setQuestion("");
    setError("");
    setBusy(true);
    setSteps([]);
    setAssistant(true);
    setView("workspace");
    setTab("overview");
    abort.current = new AbortController();
    const generation = ++requestGeneration.current;
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
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
            const computed = executePlan(dataset, profile, data.plan);
            setActivePlan(data.plan);
            setEntries((prev) =>
              [
                ...prev,
                {
                  id: `analysis-${Date.now()}`,
                  question: q,
                  plan: data.plan,
                  result: computed,
                  mode: data.mode,
                  retrieved: data.retrieved,
                },
              ].slice(-30),
            );
            received = true;
          }
        }
        if (done) break;
      }
      if (!received) throw new Error("分析连接中断，请重试。");
    } catch (e) {
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
  function applyClean() {
    requestGeneration.current++;
    abort.current?.abort();
    setBusy(false);
    setUndo(dataset);
    setUndoEntries(entries);
    const next = cleanDataset(dataset, cleanOptions);
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
  return (
    <div
      className={`app-shell ${!assistant ? "assistant-hidden" : ""} ${mobileChat ? "mobile-chat-open" : ""}`}
    >
      <input
        type="file"
        ref={fileInput}
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
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
            <strong>我的分析空间</strong>
            <small>个人工作空间</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-caption">工作空间</div>
        <nav aria-label="主导航">
          <button
            className={view === "workspace" ? "nav-item active" : "nav-item"}
            onClick={() => setView("workspace")}
          >
            <LayoutDashboard size={18} />
            分析工作台<span className="nav-shortcut">⌘ 1</span>
          </button>
          <button
            className={view === "datasets" ? "nav-item active" : "nav-item"}
            onClick={() => setView("datasets")}
          >
            <Database size={18} />
            我的数据集<span className="nav-count">1</span>
          </button>
          <button
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
                      setActivePlan(e.plan);
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
          <div className="tip-card">
            <span className="tip-icon">
              <Sparkles size={17} />
            </span>
            <strong>从好问题，开始好分析</strong>
            <p>
              不用写代码，试着告诉数问
              <br />
              你想从数据中发现什么。
            </p>
            <button onClick={() => setDialog("help")}>
              查看使用指南 <ArrowUpRight size={13} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setDialog("settings")}>
            <Settings2 size={17} />
            工作空间设置
          </button>
          <button className="nav-item" onClick={() => setDialog("help")}>
            <CircleHelp size={17} />
            帮助与反馈
            <ArrowUpRight size={13} className="push-right" />
          </button>
          <div className="user-bar">
            <span className="user-avatar">数</span>
            <div>
              <strong>数据探索者</strong>
              <small>保持好奇，发现更多</small>
            </div>
            <span className="user-online" />
          </div>
        </div>
      </aside>
      <section className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>
              {view === "workspace"
                ? "分析工作台"
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
              className="avatar-mini"
              onClick={() => setDialog("settings")}
              aria-label="工作空间设置"
            >
              数
            </button>
          </div>
        </header>
        <div className="content-shell">
          <main className="workspace-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span /> DATA, MEET CLARITY
                </div>
                <h1>
                  {view === "workspace"
                    ? "把数据，变成答案。"
                    : view === "datasets"
                      ? "每一次洞察，从数据开始。"
                      : "让每一次发现，都有据可查。"}
                </h1>
                <p>
                  {view === "workspace"
                    ? "连接你的数据，用自然语言发现值得行动的洞察。"
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
            <div className="dataset-banner">
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
              <span className="badge green">
                <Check size={12} />
                可分析
              </span>
              <button
                className="icon-button"
                aria-label="查看数据集"
                onClick={() => {
                  setView("workspace");
                  setTab("preview");
                }}
              >
                <ChevronRight size={17} />
              </button>
            </div>
            {view === "workspace" && (
              <>
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
                      <span className="tiny-count">
                        {profile.fields.filter((f) => f.missing || f.invalid)
                          .length + (profile.duplicates > 0 ? 1 : 0)}
                      </span>
                    </button>
                  </div>
                  <button
                    className="text-button export-top"
                    onClick={exportReport}
                  >
                    <ArrowDownToLine size={14} />
                    导出报告
                  </button>
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
                              : profile.rowCount,
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
                          <span>数据记录</span>
                          <span className="metric-icon blue">
                            <Database size={16} />
                          </span>
                        </div>
                        <strong>
                          {formatNumber(profile.rowCount)}
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
                                  setActivePlan((p) => ({ ...p, chart: c }))
                                }
                              >
                                {c === "line" ? (
                                  <TrendingUp size={14} />
                                ) : c === "bar" ? (
                                  <BarChart3 size={14} />
                                ) : (
                                  <span className="pie-icon" />
                                )}
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
                              setActivePlan((p) => ({
                                ...p,
                                groupBy: e.target.value,
                                sort:
                                  profile.fields.find(
                                    (f) => f.name === e.target.value,
                                  )?.type === "date"
                                    ? "natural"
                                    : "desc",
                              }))
                            }
                          >
                            {profile.fields.map((f) => (
                              <option key={f.name} value={f.name}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          指标
                          <select
                            value={activePlan.metric}
                            disabled={activePlan.aggregate === "count"}
                            onChange={(e) =>
                              setActivePlan((p) => ({
                                ...p,
                                metric: e.target.value,
                              }))
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
                        <label className="aggregate-control">
                          <select
                            aria-label="聚合方式"
                            value={activePlan.aggregate}
                            onChange={(e) =>
                              setActivePlan((p) => ({
                                ...p,
                                aggregate: e.target.value as Plan["aggregate"],
                              }))
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
                      <DataChart plan={activePlan} result={result} />
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
                        导出 CSV
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
                        <span>数据质量评分 / 100</span>
                      </div>
                      <div className="quality-overview">
                        <h3>
                          {profile.missing || profile.duplicates
                            ? "发现可以改善的数据质量问题"
                            : "数据状态良好，可以开始探索"}
                        </h3>
                        <p>
                          完整率 {profile.completeness.toFixed(2)}%，
                          {profile.missing} 个缺失单元格，{profile.duplicates}{" "}
                          条完全重复记录。
                        </p>
                        <p className="quality-formula">
                          评分 = 完整率 − 20 × 重复记录占比
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
                                setEntries(undoEntries);
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
                  <p>拖入 CSV / TSV，或点击选择文件。最多 5 MB、20,000 行。</p>
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
                              : "演示规划 · 本地计算"}
                          </span>
                          <h3>{entry.question}</h3>
                          <p>{entry.result.summary}</p>
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
                            setActivePlan(entry.plan);
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
                数据留在本机，分析有据可查
              </span>
              <span>
                数问 DataPilot <i /> 为每一个好奇的问题
              </span>
            </footer>
          </main>
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
                      ? "模型已连接"
                      : "演示模式 · 本地意图匹配"}
                  </small>
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
              <div className="chat-scroll">
                <div className="assistant-intro">
                  <div className="intro-orbit">
                    <Brand />
                  </div>
                  <h2>你好，数据探索者。</h2>
                  <p>
                    我是你的分析搭档。
                    <br />
                    说说你想了解什么，
                    <br />
                    让我们一起找到数据中的答案。
                  </p>
                  <div className="intro-meta">
                    <span>{profile.columnCount} 个字段已就绪</span>
                    <span>可追溯的计算结果</span>
                  </div>
                </div>
                <div className="starter-title">
                  <Sparkles size={13} />
                  不妨从这里开始
                </div>
                <div className="starter-list">
                  {starters.map((s, i) => (
                    <button key={s} onClick={() => void ask(s)} disabled={busy}>
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
                          {entry.mode === "model" ? "模型规划" : "演示规划"}
                        </small>
                      </div>
                      <p>{entry.result.summary}</p>
                      <button
                        className="analysis-result-card"
                        onClick={() => {
                          setActivePlan(entry.plan);
                          setView("workspace");
                          setTab("overview");
                        }}
                      >
                        <BarChart3 size={19} />
                        <span>
                          <strong>{entry.plan.title}</strong>
                          <small>
                            {entry.result.validRows.toLocaleString()} 条记录 ·
                            点击查看图表
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
                          {entry.plan.metric || "*"})，按{entry.plan.groupBy}
                          分组。
                          <br />
                          排除无效指标：{entry.result.excluded}{" "}
                          条。统计由本地引擎实际执行。
                        </p>
                      </details>
                    </div>
                  </div>
                ))}
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
                <div className="composer">
                  <textarea
                    ref={input}
                    aria-label="向数据提问"
                    placeholder="向数据提问，比如：哪个地区销售额最高？"
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
                      {mode === "model" ? "智能分析" : "演示分析"}
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
                    ? "演示模式支持字段、趋势、占比与均值等常见表达"
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
            <p>支持 CSV / TSV，兼容 UTF-8 与常见中文编码</p>
            <button
              className="button primary"
              onClick={() => fileInput.current?.click()}
            >
              选择本机文件 <ArrowRight size={14} />
            </button>
            <small>最多 5 MB · 20,000 行 · 80 个字段</small>
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
                "选择含表头的 CSV / TSV。文件留在当前浏览器，支持最多 20,000 行。",
              ],
              [
                "02",
                "用你的话提问",
                "例如“按月查看销售额趋势”“各地区平均利润”“华东的产品类别销售额占比”。演示模式按字段名匹配常见意图；连接模型后支持更灵活的表达。",
              ],
              [
                "03",
                "核对，再带走答案",
                "图表支持切换维度、指标与类型。展开“分析依据”核对参与记录、缺失排除和计算口径，再导出 Markdown 报告。",
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
                {mode === "model" ? "已连接模型" : "演示模式"}
              </span>
            </h3>
            <p>
              {mode === "model"
                ? `当前模型：${modelName}。服务端生成受限计划，浏览器执行聚合。`
                : "当前使用本地意图匹配，可体验完整的数据操作。要使用真正的大模型规划，请由部署者在服务端配置模型密钥。"}
            </p>
            <div className="config-hint">
              <code>DATA_MODEL_API_KEY</code>
              <span>服务端密钥，不能放入前端</span>
              <code>DATA_MODEL_URL</code>
              <span>兼容 Chat Completions 的服务地址</span>
              <code>DATA_MODEL_NAME</code>
              <span>默认 deepseek-flash，可按服务商调整</span>
            </div>
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
              导出当前 CSV
            </button>
          </div>
        </Modal>
      )}
      {dialog === "clean" && (
        <Modal
          title="让数据，更干净一点。"
          subtitle="清洗会生成新的本机副本，完成后可撤销。已有分析将清空，避免混用旧结果。"
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
