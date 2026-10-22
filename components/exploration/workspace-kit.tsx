"use client";
import { useRef, useState } from "react";
import {
  BookOpen,
  Download,
  FileText,
  ShieldCheck,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { type Profile } from "@/lib/data-engine";
import { type Dictionary, validateDictionary } from "@/lib/workspace-kit";
export function DictionaryEditor({
  profile,
  dictionary,
  onSave,
}: {
  profile: Profile;
  dictionary: Dictionary;
  onSave: (value: Dictionary) => void;
}) {
  const [draft, setDraft] = useState<Dictionary>(() =>
    structuredClone(dictionary),
  );
  const [field, setField] = useState(profile.fields[0].name);
  const [error, setError] = useState("");
  const definition = draft[field] || { description: "", aliases: [], unit: "" };
  const [aliasText, setAliasText] = useState(definition.aliases.join("，"));
  function update(key: "description" | "unit", value: string) {
    setDraft((d) => ({ ...d, [field]: { ...definition, [key]: value } }));
  }
  function save() {
    try {
      const next = {
        ...draft,
        [field]: {
          ...definition,
          aliases: aliasText
            .split(/[,，、\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      };
      const meaningful = Object.fromEntries(
        Object.entries(next).filter(
          ([, v]) => v.description || v.unit || v.aliases.length,
        ),
      );
      onSave(
        validateDictionary(
          meaningful,
          profile.fields.map((f) => f.name),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "字典格式不正确。");
    }
  }
  return (
    <div className="kit-view">
      <div className="kit-callout">
        <BookOpen size={19} />
        <p>
          为缩写补充业务含义与常用说法，帮助分析助手选对真实字段。字典保存在本机；模型模式会把这些说明作为上下文发送。
        </p>
      </div>
      <label>
        选择字段
        <select
          aria-label="字典字段"
          value={field}
          onChange={(event) => {
            setDraft((d) => ({
              ...d,
              [field]: {
                ...definition,
                aliases: aliasText
                  .split(/[,，、\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            }));
            setField(event.target.value);
            setAliasText((draft[event.target.value]?.aliases || []).join("，"));
            setError("");
          }}
        >
          {profile.fields.map((f) => (
            <option key={f.name}>{f.name}</option>
          ))}
        </select>
      </label>
      <label>
        字段含义
        <textarea
          aria-label="字段含义"
          value={definition.description}
          maxLength={300}
          placeholder="例如：实付销售金额，不含退款。请填写真实口径。"
          onChange={(e) => update("description", e.target.value)}
        />
      </label>
      <label>
        常用别名
        <input
          aria-label="字段别名"
          value={aliasText}
          maxLength={340}
          placeholder="例如：营收，销售收入（逗号分隔，最多8个）"
          onChange={(e) => setAliasText(e.target.value)}
        />
      </label>
      <label>
        单位
        <input
          aria-label="字段单位"
          maxLength={20}
          value={definition.unit}
          placeholder="例如：元、万元、件；不会自动换算原始数值"
          onChange={(e) => update("unit", e.target.value)}
        />
      </label>
      <p className="kit-muted">
        字段类型保持原始推断。别名不得与其他字段或其别名冲突。业务释义帮助模型理解，不会修改或计算新字段。
      </p>
      {error && (
        <p role="alert" className="scope-error">
          {error}
        </p>
      )}
      <button className="button primary full-width" onClick={save}>
        <CheckCircle2 size={15} />
        保存字段字典
      </button>
    </div>
  );
}
export function DeliveryCenter({
  onHTML,
  onPreview,
  onMarkdown,
  onRecipe,
  onImport,
}: {
  onHTML: () => void;
  onPreview: () => void;
  onMarkdown: () => void;
  onRecipe: () => Promise<void>;
  onImport: (text: string) => Promise<void>;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="kit-view">
      <div className="kit-callout">
        <FileText size={21} />
        <p>
          将当前分析、收藏和历史结果整理成可核验的成果。HTML
          报告内置图表、表格、筛选范围与口径，可离线阅读并用浏览器打印为 PDF。
        </p>
      </div>
      <div className="delivery-grid">
        <button className="delivery-option" onClick={onHTML}>
          <FileText size={24} />
          <strong>可打印 HTML 报告</strong>
          <span>离线图表与表格 · 无外部脚本</span>
        </button>
        <button className="delivery-option" onClick={onMarkdown}>
          <Download size={24} />
          <strong>Markdown 报告</strong>
          <span>便于编辑和纳入技术文档</span>
        </button>
      </div>
      <button className="button subtle" onClick={onPreview}>
        预览当前报告
      </button>
      <div className="recipe-section">
        <h3>迁移分析口径，不带走整张表。</h3>
        <p>
          配置包含当前计划、收藏、字典和数据指纹，不含原始行。仍会包含筛选值、分类标签与批注，分享前请核对内容。接收方需先导入相同
          CSV，才能恢复配置。
        </p>
        <div className="kit-buttons">
          <button
            className="button subtle"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await onRecipe();
                setMessage("已生成配置；请保留原始 CSV 以便在另一设备恢复。");
              })
            }
          >
            <Download size={15} />
            导出分析配置
          </button>
          <button
            className="button subtle"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            <Upload size={15} />
            导入分析配置
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          aria-label="分析配置文件"
          hidden
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (!selected) return;
            void perform(async () => {
              if (selected.size > 100000)
                throw new Error("分析配置超过 100 KB。");
              await onImport(await selected.text());
              setMessage("配置已校验并恢复；原始数据未修改。");
            });
            e.target.value = "";
          }}
        />
      </div>
      <p className="kit-muted">
        <ShieldCheck size={13} /> SHA-256
        校验同一数据，先完整验证再恢复。导入会替换当前计划、筛选、字典和收藏，不替换原始数据或分析历史。
      </p>
      {busy && <p role="status">正在本机计算数据指纹…</p>}
      {message && (
        <p role="status" className="kit-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="scope-error">
          {error}
        </p>
      )}
    </div>
  );
}
