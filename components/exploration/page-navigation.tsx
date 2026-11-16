"use client";
import { Activity, ArrowRight, BarChart3, Clock3, Database, FileText, FlaskConical, LayoutDashboard, ShieldCheck, Sparkles, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { nextPages, workspacePages, type WorkspacePage } from "@/lib/workspace-navigation";
const icons = { overview: LayoutDashboard, datasets: Database, preview: Table2, quality: ShieldCheck, charts: BarChart3, diagnostics: Activity, intelligence: Sparkles, lab: FlaskConical, reports: FileText };
export function PageNavigation({ current, onNavigate }: { current: WorkspacePage; onNavigate: (page: WorkspacePage) => void }) {
  return <nav className="page-navigation" aria-label="主导航">{workspacePages.map((page, index) => {
    const Icon = icons[page.id];
    return <div key={page.id} className={`page-navigation-item ${["overview", "datasets", "charts", "reports"].includes(page.id) ? "mobile-primary" : ""}`}>
      {(index === 0 || workspacePages[index - 1].group !== page.group) && <span className="page-navigation-group">{page.group}</span>}
      <a href={`#/${page.id}`} className={`nav-item ${current === page.id ? "active" : ""}`} aria-current={current === page.id ? "page" : undefined} onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(page.id); }}><Icon size={18} />{page.title}</a>
    </div>;
  })}</nav>;
}
export function PageSwitcher({ current, onNavigate }: { current: WorkspacePage; onNavigate: (page: WorkspacePage) => void }) {
  return <label className="mobile-page-switcher">切换页面<select aria-label="切换页面" value={current} onChange={event => onNavigate(event.target.value as WorkspacePage)}>{workspacePages.map(page => <option key={page.id} value={page.id}>{page.title}</option>)}</select></label>;
}
export function WorkspaceHome({ onNavigate, rows, issues, analyses, recent, templates, collection }: { onNavigate: (page: WorkspacePage) => void; rows: number; issues: number; analyses: number; recent: WorkspacePage[]; templates: ReactNode; collection: ReactNode }) {
  const last = workspacePages.find(page => page.id === recent[0]);
  return <section className="workspace-home" aria-label="分析工作区">
    {last && <section className="home-resume" aria-label="继续上次任务"><span className="home-resume-icon"><Clock3 size={24} /></span><div className="home-resume-copy"><span>继续上次任务</span><h2>{last.title}</h2></div><button className="button primary" onClick={() => onNavigate(last.id)}>继续{last.title}<ArrowRight size={17} /></button>
      {recent.length > 1 && <nav aria-label="最近访问" className="home-recent"><span>最近访问</span>{recent.slice(1).map(id => { const item = workspacePages.find(page => page.id === id)!; return <button key={id} onClick={() => onNavigate(id)}>{item.title}<ArrowRight size={14} /></button>; })}</nav>}
    </section>}
    <div className="home-workflow-grid"><div className="home-collection-column">{collection}<details className="home-tools"><summary><LayoutDashboard size={17} />全部分析工具<span>6 个工作模块</span><ArrowRight size={16} /></summary><div className="home-directory"><div className="home-section-heading"><div><h2 id="home-task-heading">分析工作流</h2><p>从核对数据到输出结论，每一步都可追溯。</p></div><span className="home-section-count">6 个工作模块</span></div>
    <div className="home-task-grid">{(["preview", "quality", "charts", "diagnostics", "intelligence", "lab"] as const).map(id => { const page = workspacePages.find(p => p.id === id)!; const Icon = icons[id]; return <button key={id} onClick={() => onNavigate(id)} className={`home-task-card task-${id}`}><span className="home-task-icon"><Icon size={23} /></span><span className="home-task-copy"><strong>{page.title}</strong><span>{page.description}</span></span><span className="home-task-link">{id === "preview" ? `${rows.toLocaleString()} 条可查看` : id === "quality" ? issues ? `${issues} 项问题待核对` : "查看质量证据" : "进入页面"}<ArrowRight size={17} /></span></button>; })}</div></div></details></div><aside className="home-template-column" aria-label="场景模板与报告">{templates}
    <div className="home-report-card"><FileText size={25} /><div><h3>报告交付</h3><p>{analyses ? `已有 ${analyses} 项分析可用于报告，继续核对并导出成果。` : "完成分析后，在报告页集中整理结果与计算依据。"}</p></div><button className="button subtle" onClick={() => onNavigate("reports")}>打开报告页<ArrowRight size={16} /></button></div></aside></div>
  </section>;
}
export function NextPages({ current, onNavigate }: { current: WorkspacePage; onNavigate: (page: WorkspacePage) => void }) {
  const next = nextPages[current];
  if (!next) return null;
  return <nav className="next-pages" aria-label="继续下一步"><h2>接下来</h2><div>{next.map(id => { const page = workspacePages.find(p => p.id === id)!; const Icon = icons[id]; return <button key={id} onClick={() => onNavigate(id)}><Icon size={20} /><span><strong>{page.title}</strong><small>{page.description}</small></span><ArrowRight size={18} /></button>; })}</div></nav>;
}
