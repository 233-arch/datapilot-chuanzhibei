export const workspacePages = [
  { id: "overview", title: "工作台首页", description: "查看数据状态，选择这次分析要完成的任务。", group: "工作空间" },
  { id: "datasets", title: "我的数据集", description: "导入、管理与导出本机数据。", group: "准备数据" },
  { id: "preview", title: "数据明细", description: "搜索、排序与选择字段，核对原始记录。", group: "准备数据" },
  { id: "quality", title: "质量检查", description: "定位问题、预览清洗影响，再核对处理结果。", group: "准备数据" },
  { id: "charts", title: "图表分析", description: "选择维度与指标，用趋势和分组图表探索数据。", group: "探索分析" },
  { id: "diagnostics", title: "业务诊断", description: "比较两个周期，找到变化发生的分组。", group: "探索分析" },
  { id: "intelligence", title: "智能分析", description: "通过分析路线、指标与业务知识验证问题。", group: "探索分析" },
  { id: "lab", title: "创新实验室", description: "尝试异常检测、情景推演和洞察对比。", group: "探索分析" },
  { id: "reports", title: "洞察报告", description: "回顾分析记录，整理并导出可信的结果。", group: "输出成果" },
] as const;
export type WorkspacePage = typeof workspacePages[number]["id"];
export type WorkspaceTab = Exclude<WorkspacePage, "datasets" | "reports">;
export type WorkspaceView = "workspace" | "datasets" | "reports";
export function parseWorkspacePage(hash: string): WorkspacePage | null {
  const key = hash.replace(/^#\//, "");
  return workspacePages.some(page => page.id === key) ? key as WorkspacePage : null;
}
export function pageFromState(view: WorkspaceView, tab: WorkspaceTab): WorkspacePage { return view === "workspace" ? tab : view; }
export function stateFromPage(page: WorkspacePage): { view: WorkspaceView; tab?: WorkspaceTab } {
  return page === "datasets" || page === "reports" ? { view: page } : { view: "workspace", tab: page };
}
export const nextPages: Partial<Record<WorkspacePage, WorkspacePage[]>> = {
  datasets: ["preview", "quality"], preview: ["quality", "charts"], quality: ["charts", "preview"],
  charts: ["diagnostics", "reports"], diagnostics: ["lab", "reports"], intelligence: ["charts", "reports"],
  lab: ["charts", "reports"], reports: ["charts", "overview"],
};
