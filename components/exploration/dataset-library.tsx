import { useState } from "react";
import { ArrowRight, Database, FileSpreadsheet, FolderOpen, HardDrive, LoaderCircle, Search, ShieldCheck, Trash2, Upload, Download, Bookmark, RotateCcw, CheckCircle2, AlertTriangle, LayoutGrid, List } from "lucide-react";
import { type Dataset, FILE_SIZE_LABEL } from "@/lib/data-engine";
import { LIBRARY_LIMIT, type LibraryItem } from "@/lib/workspace-snapshot";

export function DatasetLibrary({ dataset, items, loading, busy, error, saved, saveError, canUndo, onSave, onOpen, onDelete, onUndo, onRefresh, onImport, onFile, onAnalyze, onDownload }: {
  dataset: Dataset; items: LibraryItem[]; loading: boolean; busy: boolean; error: string; saved: boolean; saveError: boolean; canUndo: boolean;
  onSave: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void; onUndo: () => void;
  onRefresh: () => void; onImport: () => void; onFile: (file: File) => void; onAnalyze: () => void; onDownload: () => void;
}) {
  const [query, setQuery] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [sort, setSort] = useState("recent");
  const matches = items.filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "zh-CN") : sort === "rows" ? b.rows - a.rows : b.savedAt.localeCompare(a.savedAt));
  const currentSaved = items.some(item => item.id === dataset.id);
  return <div className="data-library" aria-busy={busy || loading}>
    <section className="library-active">
      <div className="library-active-heading"><span className="library-file-icon"><FileSpreadsheet size={27} /></span>
        <div><span className="library-kicker">正在使用</span><h2>{dataset.name}</h2><p>{dataset.rows.length.toLocaleString()} 条记录 · {dataset.columns.length} 个字段 · {dataset.source === "demo" ? "合成示例" : "本机导入"}</p></div>
        <span className="library-save-state">{saveError ? <AlertTriangle size={15} /> : saved ? <CheckCircle2 size={15} /> : <LoaderCircle size={15} className="spin" />}{saveError ? "自动保存未完成" : saved ? "工作已自动保存" : "正在保存当前工作"}</span>
      </div>
      <div className="library-active-bottom"><p>保留一份数据与分析配置，下次从这里继续。</p><div className="library-actions">
        <button className="button subtle" onClick={onSave} disabled={busy || loading}><Bookmark size={16} />{currentSaved ? "更新库中副本" : "保存到数据集库"}</button>
        <button className="button subtle" onClick={onDownload} disabled={busy}><Download size={16} />导出 CSV</button>
        <button className="button primary" onClick={onAnalyze} disabled={busy}>继续分析 <ArrowRight size={16} /></button>
      </div></div>
    </section>
    <div className="library-heading"><div><h2>本机数据集库 <span>{items.length} / {LIBRARY_LIMIT}</span></h2><p>切换数据前自动保留最新副本，包含筛选、收藏、分析记录与规则。</p></div>
    </div>
    {error && <div className="library-error" role="alert"><span>{error}</span><button className="button subtle" onClick={onRefresh} disabled={busy}>重新读取</button></div>}
    {canUndo && <div className="library-undo" role="status"><span>已移除副本。当前打开的数据不受影响。</span><button className="button subtle" onClick={onUndo} disabled={busy}><RotateCcw size={15} />撤销移除</button></div>}
    <div className="library-toolbar"><label className="library-search"><Search size={18} /><input aria-label="搜索已保存的数据集" placeholder="搜索已保存的数据集…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="清空数据集搜索" onClick={() => setQuery("")}>清空</button>}</label><label className="library-sort"><span>排序</span><select aria-label="数据集排序" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">最近保存</option><option value="name">文件名称</option><option value="rows">记录数量</option></select></label><div className="library-view-switch" aria-label="数据集显示方式"><button aria-label="列表视图" title="列表视图" aria-pressed={layout === "list"} onClick={() => setLayout("list")}><List size={18} /></button><button aria-label="卡片视图" title="卡片视图" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}><LayoutGrid size={18} /></button></div></div>
    {loading ? <div className="library-empty" role="status"><LoaderCircle size={28} className="spin" /><h3>正在读取本机数据集库</h3></div> : matches.length ? layout === "list" ? <div className="library-table-wrap"><table className="library-table"><caption className="sr-only">已保存的数据集</caption><thead><tr><th scope="col">数据集名称</th><th scope="col">数据规模</th><th scope="col">分析资产</th><th scope="col">保存时间</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead><tbody>{matches.map(item => <tr key={item.id} className={item.id === dataset.id ? "is-current" : ""}>
      <td><button className="library-name-button" disabled={busy} onClick={() => item.id === dataset.id ? onAnalyze() : onOpen(item.id)}><span className="library-file-icon"><FileSpreadsheet size={20} /></span><span><strong>{item.name}</strong><small>{item.id === dataset.id ? "当前数据的副本" : item.source === "demo" ? "合成示例" : "本机文件"}</small></span></button></td>
      <td><strong>{item.rows.toLocaleString()} 行</strong><small>{item.columns} 个字段</small></td><td><span>{item.analyses} 分析 · {item.pins} 收藏</span><small>{item.rules} 条规则</small></td><td><time dateTime={item.savedAt}>{new Date(item.savedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></td>
      <td>{removeId === item.id ? <div className="library-row-confirm"><span>移除副本？</span><button className="text-button" disabled={busy} onClick={() => setRemoveId(null)}>取消</button><button className="text-button library-danger" disabled={busy} onClick={() => { onDelete(item.id); setRemoveId(null); }}>确认</button></div> : <div className="library-row-actions"><button className="icon-button" aria-label={`打开 ${item.name}`} title="打开工作空间" disabled={busy} onClick={() => item.id === dataset.id ? onAnalyze() : onOpen(item.id)}><ArrowRight size={17} /></button><button className="icon-button" aria-label={`移除副本 ${item.name}`} title="移除库中副本" disabled={busy} onClick={() => setRemoveId(item.id)}><Trash2 size={16} /></button></div>}</td>
    </tr>)}</tbody></table></div> : <div className="library-grid">{matches.map(item => <article className="library-card" key={item.id}>
      <div className="library-card-top"><span className="library-file-icon"><Database size={22} /></span><span className={item.id === dataset.id ? "badge green" : "badge"}>{item.id === dataset.id ? "当前数据的副本" : item.source === "demo" ? "合成示例" : "本机文件"}</span></div>
      <h3>{item.name}</h3><p className="library-card-size">{item.rows.toLocaleString()} 条记录 <span>·</span> {item.columns} 个字段</p>
      <div className="library-card-facts"><span><strong>{item.analyses}</strong> 分析记录</span><span><strong>{item.pins}</strong> 收藏</span><span><strong>{item.rules}</strong> 规则</span></div>
      <p className="library-card-time">保存于 {new Date(item.savedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
      {removeId === item.id ? <div className="library-remove-confirm"><p>移除“{item.name}”的库中副本？</p><div><button className="button subtle" disabled={busy} onClick={() => setRemoveId(null)}>取消</button><button className="button library-danger" disabled={busy} onClick={() => { onDelete(item.id); setRemoveId(null); }}>确认移除</button></div></div> : <div className="library-card-actions">
        <button className="button subtle" disabled={busy} onClick={() => item.id === dataset.id ? onAnalyze() : onOpen(item.id)}><FolderOpen size={16} />{item.id === dataset.id ? "继续当前工作" : "打开工作空间"}</button>
        <button className="icon-button" aria-label={`移除副本 ${item.name}`} title="移除库中副本" disabled={busy} onClick={() => setRemoveId(item.id)}><Trash2 size={17} /></button>
      </div>}
    </article>)}</div> : <div className="library-empty"><FolderOpen size={34} /><h3>{query ? "没有匹配的数据集" : "从保存第一份工作开始"}</h3><p>{query ? "试试文件名中的其他关键词，或清空搜索查看全部。" : "当前工作会自动保存。加入数据集库后，可以在不同文件之间切换继续分析。"}</p>{!query && <button className="button subtle" onClick={onSave} disabled={busy}>保存当前工作</button>}</div>}
    <div className={`library-dropzone${dragging ? " dragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy && event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]); }}>
      <Upload size={24} /><div><h3>拖入下一份数据，继续探索</h3><p>CSV / TSV / XLSX · 最大 {FILE_SIZE_LABEL} · 20,000 行 · 80 列</p></div><button className="button subtle" disabled={busy} onClick={onImport}>选择文件</button>
    </div>
    <div className="library-storage-note"><HardDrive size={18} /><p>数据仅保存在当前设备的此浏览器中，清理浏览器数据会删除本机工作。重要原始数据请另行备份。</p><ShieldCheck size={18} /><p>副本不包含 API 密钥。模型模式只发送摘要与统计信息。</p></div>
  </div>;
}
