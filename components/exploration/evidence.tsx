"use client";
import { useState } from "react";
import {
  Download,
  Filter,
  Search,
  FileSearch,
  ShieldCheck,
} from "lucide-react";
import { type Dataset, type Plan, numeric } from "@/lib/data-engine";
export type EvidenceSelection = {
  title: string;
  dataset: Dataset;
  plan?: Plan;
  group?: string;
};
export function EvidenceView({
  selection,
  onExport,
  onFilter,
  dimensions = [],
  onDrill,
}: {
  selection: EvidenceSelection;
  onExport: (dataset: Dataset) => void;
  onFilter?: () => void;
  dimensions?: string[];
  onDrill?: (field: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const [nextDimension, setNextDimension] = useState(dimensions[0] || "");
  const dataset = selection.dataset;
  const rows = dataset.rows.filter(
    (r) =>
      !search ||
      dataset.columns.some((c) =>
        String(r[c] ?? "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
  );
  const plan = selection.plan;
  const valid = plan
    ? dataset.rows.filter(
        (r) => plan.aggregate === "count" || numeric(r[plan.metric]) !== null,
      ).length
    : dataset.rows.length;
  return (
    <div className="evidence-view">
      <div className="evidence-summary">
        <span>
          <FileSearch size={16} />
          <strong>{dataset.rows.length.toLocaleString()}</strong> 条来源记录
        </span>
        <span>
          <ShieldCheck size={15} />
          {valid.toLocaleString()} 条参与指标计算
        </span>
      </div>
      <p className="evidence-caption">
        这里展示当前筛选和图表分组对应的原始记录，包含被排除的缺失指标，方便核对口径。
      </p>
      <div className="evidence-toolbar">
        <div className="search-box">
          <Search size={14} />
          <input
            aria-label="搜索来源明细"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="在来源明细中搜索…"
          />
        </div>
        <div>
          {onFilter && (
            <button className="button primary" onClick={onFilter}>
              <Filter size={13} />
              联动筛选此分组
            </button>
          )}
          <button
            className="button subtle"
            onClick={() => onExport({ ...dataset, rows })}
          >
            <Download size={13} />
            导出明细
          </button>
        </div>
      </div>
      {onDrill && dimensions.length > 0 && (
        <div className="evidence-drill">
          <label>
            保留此分组，继续探索
            <select
              aria-label="继续分析维度"
              value={nextDimension}
              onChange={(e) => setNextDimension(e.target.value)}
            >
              {dimensions.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            onClick={() => onDrill(nextDimension)}
          >
            按此维度继续分析
          </button>
          <p>保留已有筛选、指标与聚合方式；只改变分组维度，并重新计算结果。</p>
        </div>
      )}
      <div className="table-overflow">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              {dataset.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * 8, page * 8).map((row, index) => (
              <tr key={index}>
                <td>{(page - 1) * 8 + index + 1}</td>
                {dataset.columns.map((c) => (
                  <td key={c} className={row[c] === null ? "missing-cell" : ""}>
                    {row[c] === null ? <span>空值</span> : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="table-empty">没有匹配记录</div>}
      </div>
      <div className="pagination">
        <span>共 {rows.length} 条来源记录</span>
        <div>
          <button
            className="button subtle"
            disabled={page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            上一页
          </button>
          <span>
            {page} / {Math.max(1, Math.ceil(rows.length / 8))}
          </span>
          <button
            className="button subtle"
            disabled={page >= Math.ceil(rows.length / 8)}
            onClick={() => setPage((v) => v + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
