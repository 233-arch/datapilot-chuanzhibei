"use client";

import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, Check, ChevronLeft, ChevronRight, Columns3, Download, Hash, RotateCcw, Search, Table2, X } from "lucide-react";
import { toCSV, type Dataset, type Profile } from "@/lib/data-engine";
import { isPreviewMissing, previewExport, previewPage, previewRows, type PreviewSort } from "@/lib/data-preview";

export type PreviewView = { query: string; sort: PreviewSort; page: number; pageSize: number; hiddenColumns: string[] };
export const defaultPreviewView = (): PreviewView => ({ query: "", sort: null, page: 1, pageSize: 12, hiddenColumns: [] });
type DataPreviewProps = { dataset: Dataset; profile: Profile; viewState?: PreviewView; onViewChange: (view: PreviewView) => void; onExport?: (dataset: Dataset) => void };

export function DataPreview(props: DataPreviewProps) {
  return <DataPreviewContent key={props.dataset.id} {...props} />;
}

function DataPreviewContent({ dataset, profile, viewState, onViewChange, onExport }: DataPreviewProps) {
  const uid = useId();
  const view = viewState ?? defaultPreviewView();
  const { query, sort, page, pageSize, hiddenColumns } = view;
  const updateView = (patch: Partial<PreviewView>) => { onViewChange({ ...view, ...patch }); setExportMessage(""); };
  const [exportMessage, setExportMessage] = useState("");
  const chosenColumns = dataset.columns.filter(column => !hiddenColumns.includes(column));
  const columns = chosenColumns.length ? chosenColumns : dataset.columns.slice(0, 1);
  const fields = new Map(profile.fields.map(field => [field.name, field]));
  const matched = useMemo(() => previewRows(dataset, profile, query, sort), [dataset, profile, query, sort]);
  const pagination = previewPage(matched.length, page, pageSize);
  const shown = matched.slice(pagination.start, pagination.end);
  const effectiveSort = sort && dataset.columns.includes(sort.field) ? sort : null;
  const updateQuery = (value: string) => updateView({ query: value, page: 1 });
  const updateSort = (field: string) => {
    updateView({ sort: sort?.field !== field ? { field, direction: "asc" } : sort.direction === "asc" ? { field, direction: "desc" } : null, page: 1 });
  };
  const resetView = () => updateView({ ...defaultPreviewView(), pageSize });
  const exportRows = () => {
    const result = previewExport(dataset, matched, columns);
    if (onExport) onExport(result);
    else {
      const url = URL.createObjectURL(new Blob([toCSV(result)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = result.name; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setExportMessage(`已生成 CSV：${matched.length.toLocaleString()} 条匹配记录、${columns.length} 个显示字段，请查看浏览器下载。`);
  };

  return <section className="data-preview-card" aria-labelledby={`${uid}-title`}>
    <header className="data-preview-heading">
      <div className="data-preview-title"><span className="data-preview-icon"><Table2 size={23} /></span><div><h3 id={`${uid}-title`}>数据明细</h3><p>查找、排序与核对每一条记录</p></div></div>
      <button type="button" className="data-preview-export" onClick={exportRows} disabled={!matched.length || !columns.length}><Download size={17} />导出当前结果</button>
    </header>

    <div className="data-preview-toolbar">
      <div className="data-preview-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="搜索全部字段的数据" placeholder="在全部字段中搜索…" value={query} onChange={event => updateQuery(event.target.value)} />{query && <button type="button" aria-label="清空数据搜索" onClick={() => updateQuery("")}><X size={17} /></button>}</div>
      <details className="data-preview-columns">
        <summary><Columns3 size={17} />显示字段 <span>{columns.length}/{dataset.columns.length}</span></summary>
        <div className="data-preview-column-menu"><div className="data-preview-column-heading"><strong>选择要显示的字段</strong><button type="button" onClick={() => { updateView({ hiddenColumns: [] }); }} disabled={!hiddenColumns.length}>显示全部</button></div><p>至少保留一个字段。搜索仍覆盖全部字段。</p><div className="data-preview-column-list">{dataset.columns.map(column => <label key={column}><input type="checkbox" checked={columns.includes(column)} disabled={columns.length === 1 && columns.includes(column)} onChange={() => { updateView({ hiddenColumns: hiddenColumns.includes(column) ? hiddenColumns.filter(name => name !== column) : [...hiddenColumns, column] }); }} /><span>{column}</span></label>)}</div></div>
      </details>
    </div>

    <div className="data-preview-context" aria-live="polite"><span><strong>{matched.length.toLocaleString()}</strong> 条{query.trim() ? "匹配记录" : "记录"}<span className="data-preview-context-divider">/</span>当前范围 {dataset.rows.length.toLocaleString()} 条</span><span className="data-preview-order">{effectiveSort ? <><span>{effectiveSort.field}</span>{effectiveSort.direction === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}{effectiveSort.direction === "asc" ? "升序" : "降序"}</> : "按原始顺序"}</span>{(query || effectiveSort || hiddenColumns.length > 0) && <button type="button" onClick={resetView}><RotateCcw size={14} />重置视图</button>}</div>

    <div className="data-preview-scroll" tabIndex={0} role="region" aria-label="数据表格，可横向滚动">
      <table className="data-preview-table"><caption className="data-preview-sr-only">当前数据范围的记录。点击列标题依次切换升序、降序和原始顺序。</caption><thead><tr><th className="data-preview-row-index" scope="col" title="记录在当前数据范围内的原始行号">行号</th>{columns.map(column => {
        const type = fields.get(column)?.type ?? "text";
        const direction = effectiveSort?.field === column ? effectiveSort.direction : null;
        return <th key={column} scope="col" aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}><button type="button" onClick={() => updateSort(column)} aria-label={`${column}，${direction === "asc" ? "当前升序，点击降序" : direction === "desc" ? "当前降序，点击恢复原始顺序" : "点击升序排列"}`}><span className="data-preview-field-type" aria-hidden="true">{type === "number" ? <Hash size={15} /> : type === "date" ? <CalendarDays size={15} /> : "Aa"}</span><span>{column}</span>{direction === "asc" ? <ArrowUp size={15} /> : direction === "desc" ? <ArrowDown size={15} /> : <ArrowUpDown size={14} className="data-preview-sort-idle" />}</button></th>;
      })}</tr></thead><tbody>{shown.map(item => <tr key={item.sourceIndex}><th scope="row" className="data-preview-row-index">{item.sourceIndex + 1}</th>{columns.map(column => <td key={column} className={fields.get(column)?.type === "number" ? "data-preview-numeric" : undefined} title={isPreviewMissing(item.row[column]) ? "空值" : String(item.row[column])}>{isPreviewMissing(item.row[column]) ? <span className="data-preview-missing">空值</span> : <span className="data-preview-cell-value">{String(item.row[column])}</span>}</td>)}</tr>)}</tbody></table>
    </div>

    {!matched.length && <div className="data-preview-empty"><Search size={29} /><h4>{query.trim() ? "没有找到匹配记录" : "当前范围没有数据"}</h4><p>{query.trim() ? "试试更短的关键词，或清空搜索查看当前范围。" : "请调整上方数据筛选，或导入新的数据文件。"}</p>{query.trim() && <button type="button" onClick={() => updateQuery("")}>清空搜索</button>}</div>}

    <footer className="data-preview-footer"><label htmlFor={`${uid}-page-size`}>每页<select id={`${uid}-page-size`} value={pageSize} onChange={event => { updateView({ pageSize: Number(event.target.value), page: 1 }); }}>{[12, 25, 50, 100].map(size => <option key={size} value={size}>{size} 条</option>)}</select></label><span className="data-preview-range">{matched.length ? `${pagination.start + 1}–${pagination.end}` : "0"} / {matched.length.toLocaleString()} 条</span><nav className="data-preview-pagination" aria-label="数据表分页"><button type="button" disabled={pagination.page <= 1} onClick={() => updateView({ page: pagination.page - 1 })} aria-label="数据表上一页"><ChevronLeft size={18} /><span>上一页</span></button><span>{pagination.page} / {pagination.pages}</span><button type="button" disabled={pagination.page >= pagination.pages} onClick={() => updateView({ page: pagination.page + 1 })} aria-label="数据表下一页"><span>下一页</span><ChevronRight size={18} /></button></nav></footer>
    <div className="data-preview-note"><span>行号对应当前范围内的原始位置；空值和异常类型值排序时置后。</span><span>导出全部匹配记录与显示字段，不受分页影响。</span></div>
    {exportMessage && <p className="data-preview-export-status" role="status"><Check size={16} />{exportMessage}</p>}
  </section>;
}
