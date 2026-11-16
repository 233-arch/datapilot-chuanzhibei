import type { Profile, Plan } from "./data-engine";
import type { WorkspacePage } from "./workspace-navigation";
export type ContextAction = { id: string; label: string; description: string; page?: WorkspacePage; question?: string; kind?: "report" | "audit" };
export function contextActions(page: WorkspacePage, profile: Profile, plan: Plan): ContextAction[] {
  if (page === "quality") return [
    { id: "quality-summary", label: "解释当前质量情况", description: "统计当前筛选范围的缺失、重复与无效值", question: "质量摘要" },
    { id: "quality-evidence", label: "定位问题记录", description: "打开逐项质量检查与规则核验", page: "quality" },
    { id: "quality-clean", label: "预览清洗操作", description: "先核对受影响记录，再决定是否执行", kind: "audit" }];
  if (page === "reports") return [
    { id: "report-check", label: "核对报告范围", description: "比较选中章节的指标与筛选条件", kind: "report" },
    { id: "report-quality", label: "检查数据质量", description: "回到数据质量与业务规则检查", page: "quality" },
    { id: "report-chart", label: "补充图表分析", description: "继续分析并收藏需要的图表", page: "charts" }];
  const date = profile.fields.find(f => f.type === "date");
  const metric = profile.fields.find(f => f.name === plan.metric && f.type === "number") || profile.fields.find(f => f.type === "number");
  return [
    ...(date && metric ? [{ id: "trend", label: `查看${metric.name}趋势`, description: `按${date.name}分组，先预览分析计划`, question: `按${date.name}按月查看${metric.name}趋势` }] : []),
    { id: "fields", label: "查看字段含义", description: "依据当前项目的字段字典解释", question: "查看字段" },
    { id: "add-report", label: "将当前图表加入报告", description: "保留当前指标和筛选范围，先预览再确认", kind: "report" },
  ];
}
