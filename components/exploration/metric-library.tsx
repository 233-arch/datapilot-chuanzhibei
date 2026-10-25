import { useState } from "react";
import { Bookmark, Trash2, ArrowRight } from "lucide-react";
import { type Dataset, type Profile, formatNumber } from "@/lib/data-engine";
import {
  type SavedMetric,
  type DiagnosticState,
  saveMetric,
  metricValue,
} from "@/lib/workbench";
export function MetricLibrary({
  dataset,
  profile,
  items,
  onChange,
  current,
  onLoad,
}: {
  dataset: Dataset;
  profile: Profile;
  items: SavedMetric[];
  onChange: (items: SavedMetric[]) => void;
  current: DiagnosticState;
  onLoad: (m: SavedMetric) => void;
}) {
  const [name, setName] = useState(""),
    [unit, setUnit] = useState(""),
    [description, setDescription] = useState(""),
    [message, setMessage] = useState("");
  function save() {
    try {
      onChange(
        saveMetric(
          items,
          {
            id: crypto.randomUUID(),
            name,
            numerator: current.numerator,
            denominator: current.denominator,
            kind: current.kind,
            percent: current.percent,
            unit,
            description,
          },
          profile,
        ),
      );
      setName("");
      setDescription("");
      setMessage("指标已保存，工作区会在本机自动保存。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败。");
    }
  }
  return (
    <section className="metric-library">
      <div className="diagnostic-heading">
        <div>
          <span className="eyebrow">SAVED METRICS</span>
          <h3>
            我的指标库 <small>{items.length}/12</small>
          </h3>
          <p>
            保存公式、单位与定义，当前全局筛选同步计算。指标定义与原始数据绑定。
          </p>
        </div>
        <Bookmark size={22} />
      </div>
      <div className="diagnostic-controls">
        <label>
          指标名称
          <input
            value={name}
            maxLength={40}
            placeholder="如：社团活动成本率"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          显示单位
          <input
            value={unit}
            maxLength={20}
            placeholder="元 / 人等，可留空"
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
        <label>
          口径说明
          <input
            value={description}
            maxLength={300}
            placeholder="哪些记录参与计算"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
      <button
        className="button"
        onClick={save}
        disabled={!name.trim() || !current.numerator || !current.denominator}
      >
        <Bookmark size={14} />
        保存上方公式
      </button>
      {message && (
        <p role="status" className="diagnostic-note">
          {message}
        </p>
      )}
      {!items.length && (
        <p className="empty-note">
          先在上方确认计算方式和字段，再保存一个可复用的指标。
        </p>
      )}
      <div className="saved-metrics-grid">
        {items.map((m) => {
          let r;
          try {
            r = metricValue(dataset, m);
          } catch {
            return null;
          }
          return (
            <article className="saved-metric" key={m.id}>
              <div>
                <h4>{m.name}</h4>
                <button
                  className="icon-button"
                  aria-label={"删除指标" + m.name}
                  onClick={() => onChange(items.filter((v) => v.id !== m.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <strong>
                {r.value === null
                  ? "不适用"
                  : formatNumber(r.value * (m.percent ? 100 : 1)) +
                    (m.percent ? "%" : m.unit)}
              </strong>
              <p>
                {m.numerator}合计 / {m.denominator}
                {m.kind === "distinct" ? "去重数" : "合计"}
              </p>
              <p>{m.description || "成对完整记录参与；零分母不计算。"}</p>
              <small>
                参与 {r.valid} 条 · 排除 {r.excluded} 条
              </small>
              <button className="text-button" onClick={() => onLoad(m)}>
                载入公式核对 <ArrowRight size={12} />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
