"use client";
import { useId, useState, useEffect } from "react";
import { Filter, Plus, X, RotateCcw, ChevronDown } from "lucide-react";
import {
  type Dataset,
  type Profile,
  type FilterClause,
  mergeFilters,
  validateFilters,
} from "@/lib/data-engine";
const labels: Record<FilterClause["operator"], string> = {
  eq: "等于",
  contains: "包含",
  gte: "不小于 / 起始",
  lte: "不大于 / 截止",
  missing: "为空",
  bucket: "时间分组",
  group: "图表分组",
};
export function FilterBar({
  dataset,
  profile,
  filters,
  count,
  onChange,
}: {
  dataset: Dataset;
  profile: Profile;
  filters: FilterClause[];
  count: number;
  onChange: (value: FilterClause[]) => void;
}) {
  const [expanded, setExpanded] = useState(false),
    [field, setField] = useState(
      profile.fields.find((f) => f.type === "text" && f.unique < 30)?.name ||
        profile.fields[0].name,
    ),
    [operator, setOperator] = useState<FilterClause["operator"]>("eq"),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  const listId = useId();
  const selected =
    profile.fields.find((f) => f.name === field) || profile.fields[0];
  useEffect(() => {
    if (!dataset.columns.includes(field)) {
      setField(profile.fields[0].name);
      setValue("");
      setOperator("eq");
    }
  }, [dataset.id, field, profile]);
  const options = [
    ...new Set(
      dataset.rows
        .map((r) => r[field])
        .filter((v) => v !== null)
        .map(String),
    ),
  ].slice(0, 80);
  function apply() {
    if (operator !== "missing" && !value.trim()) {
      setError("请填写筛选值。");
      return;
    }
    try {
      const next = mergeFilters(filters, [
        { field, operator, value: operator === "missing" ? "" : value.trim() },
      ]);
      validateFilters(next, profile.fields);
      onChange(next);
      setError("");
      setValue("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section
      className={`scope-bar ${filters.length ? "has-filters" : ""}`}
      aria-label="联动筛选"
    >
      <div className="scope-header">
        <button
          className="scope-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <Filter size={14} />
          <strong>联动筛选</strong>
          {filters.length > 0 && (
            <span className="scope-count">{filters.length}</span>
          )}
          <ChevronDown size={12} className={expanded ? "rotate-180" : ""} />
        </button>
        <span className="scope-range">
          {count.toLocaleString()} / {profile.rowCount.toLocaleString()} 条记录
        </span>
        {filters.length > 0 && (
          <button className="text-button" onClick={() => onChange([])}>
            <RotateCcw size={12} />
            重置
          </button>
        )}
      </div>
      {filters.length > 0 && (
        <div className="scope-chips">
          {filters.map((f, i) => (
            <button
              key={`${f.field}-${f.operator}-${i}`}
              title="点击移除条件"
              aria-label={`移除筛选 ${f.field} ${f.value || "为空"}`}
              onClick={() =>
                onChange(filters.filter((_, index) => index !== i))
              }
            >
              <span>{f.field}</span>
              <small>{labels[f.operator]}</small>
              <strong>{f.operator === "missing" ? "" : f.value}</strong>
              <X size={12} />
            </button>
          ))}
        </div>
      )}
      {expanded && (
        <div className="scope-builder">
          <div className="scope-inputs">
            <label>
              字段
              <select
                aria-label="筛选字段"
                value={field}
                onChange={(e) => {
                  setField(e.target.value);
                  setOperator("eq");
                  setValue("");
                }}
              >
                {profile.fields.map((f) => (
                  <option value={f.name} key={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              条件
              <select
                aria-label="筛选条件"
                value={operator}
                onChange={(e) => {
                  setOperator(e.target.value as FilterClause["operator"]);
                  setValue("");
                }}
              >
                <option value="eq">等于</option>
                {selected.type === "text" && (
                  <option value="contains">包含</option>
                )}
                {selected.type !== "text" && (
                  <>
                    <option value="gte">
                      {selected.type === "date" ? "起始日期" : "不小于"}
                    </option>
                    <option value="lte">
                      {selected.type === "date" ? "截止日期" : "不大于"}
                    </option>
                  </>
                )}
                <option value="missing">为空</option>
              </select>
            </label>
            {operator !== "missing" && (
              <label className="scope-value">
                筛选值
                <input
                  aria-label="筛选值"
                  list={selected.type === "text" ? listId : undefined}
                  type={
                    selected.type === "date"
                      ? "date"
                      : selected.type === "number"
                        ? "number"
                        : "text"
                  }
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    selected.type === "text" ? "输入或选择，如华东" : "输入数值"
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") apply();
                  }}
                />
                <datalist id={listId}>
                  {options.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </label>
            )}
            <button
              className="button primary"
              onClick={apply}
              disabled={filters.length >= 8}
            >
              <Plus size={13} />
              应用筛选
            </button>
          </div>
          <p className="scope-caption">
            所有条件按“且”组合，指标、图表和数据预览同步更新；原始质量检查不受筛选影响。
          </p>
          {error && (
            <p className="scope-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
