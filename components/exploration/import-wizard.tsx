import { useEffect, useRef, useState } from "react";
import { LoaderCircle, UploadCloud, ArrowRight, X } from "lucide-react";
import { backgroundTask } from "@/lib/background";
import {
  type Dataset,
  type Profile,
  type FieldType,
  LIMITS,
  parseCSV,
  profileDataset,
} from "@/lib/data-engine";
import {
  type Sheet,
  type ImportOptions,
  type ImportCell,
} from "@/lib/import-sheet";
function shown(v: ImportCell) {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "");
}
export function ImportWizard({
  file,
  onImport,
  onClose,
}: {
  file: File;
  onImport: (dataset: Dataset, profile: Profile) => void;
  onClose: () => void;
}) {
  const [sheets, setSheets] = useState<Sheet[]>([]),
    [sheet, setSheet] = useState(0),
    [header, setHeader] = useState(0),
    [types, setTypes] = useState<ImportOptions["types"]>({}),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [phase, setPhase] = useState("正在后台解析文件…");
  const abort = useRef<AbortController | null>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    container.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  function keyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      abort.current?.abort();
      onClose();
    }
    if (event.key === "Tab") {
      const targets = Array.from(
        container.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),select,input,[tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length);
      const first = targets[0],
        last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    (async () => {
      if (file.size > LIMITS.bytes)
        throw new Error("文件超过5 MB，请精简后重试。");
      if (/\.xlsx$/i.test(file.name)) {
        const result = await backgroundTask<Sheet[]>(
          "excel",
          { buffer: await file.arrayBuffer() },
          controller.signal,
        );
        setSheets(result);
      } else {
        let text = await file.text();
        if (text.includes("\uFFFD"))
          text = new TextDecoder("gb18030").decode(await file.arrayBuffer());
        const result = await backgroundTask<{ dataset: Dataset }>(
          "csv",
          { text, name: file.name },
          controller.signal,
        );
        setSheets([
          {
            sheet: "CSV / TSV",
            data: [
              result.dataset.columns,
              ...result.dataset.rows.map((r) =>
                result.dataset.columns.map((c) => r[c]),
              ),
            ],
          },
        ]);
      }
    })()
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [file]);
  async function confirm() {
    if (!sheets[sheet]) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setPhase("正在后台校验字段与生成数据概况…");
    setError("");
    try {
      const result = await backgroundTask<{
        dataset: Dataset;
        profile: Profile;
      }>(
        "sheet",
        {
          sheet: sheets[sheet],
          name: file.name.replace(/\.[^.]+$/, "") + " · " + sheets[sheet].sheet,
          options: { header, types },
        },
        controller.signal,
      );
      onImport(result.dataset, result.profile);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const selected = sheets[sheet],
    columns = (selected?.data[header] || []).map(shown),
    body = selected?.data.slice(header + 1, header + 6) || [];
  return (
    <div
      className="import-wizard"
      ref={container}
      onKeyDown={keyboard}
      role="dialog"
      aria-modal="true"
      aria-label="数据导入向导"
    >
      <div className="import-wizard-card">
        <div className="diagnostic-heading">
          <div>
            <span className="eyebrow">IMPORT & VERIFY</span>
            <h2>确认数据，再开始探索</h2>
            <p>{file.name} · 文件在本机浏览器中解析</p>
          </div>
          <button
            className="icon-button"
            aria-label="关闭导入向导"
            onClick={() => {
              abort.current?.abort();
              onClose();
            }}
          >
            <X size={20} />
          </button>
        </div>
        {busy && (
          <div className="import-progress" role="status">
            <LoaderCircle size={24} className="spin" />
            <p>{phase}</p>
            <button
              className="button subtle"
              onClick={() => {
                abort.current?.abort();
                onClose();
              }}
            >
              取消导入
            </button>
          </div>
        )}
        {error && (
          <p className="diagnostic-warning" role="alert">
            {error}
          </p>
        )}
        {!busy && selected && (
          <>
            <div className="diagnostic-controls">
              <label>
                工作表
                <select
                  value={sheet}
                  onChange={(e) => {
                    setSheet(Number(e.target.value));
                    setHeader(0);
                    setTypes({});
                  }}
                >
                  {sheets.map((s, i) => (
                    <option key={i} value={i}>
                      {s.sheet} · {Math.max(0, s.data.length - 1)} 行
                    </option>
                  ))}
                </select>
              </label>
              <label>
                表头位置
                <select
                  value={header}
                  onChange={(e) => {
                    setHeader(Number(e.target.value));
                    setTypes({});
                  }}
                >
                  {selected.data.slice(0, 20).map((row, i) => (
                    <option key={i} value={i}>
                      第 {i + 1} 行 ·{" "}
                      {row.slice(0, 3).map(shown).join(" / ").slice(0, 65)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="diagnostic-table import-table">
              <table>
                <thead>
                  <tr>
                    {columns.map((c, i) => (
                      <th key={i}>
                        {c || "（空表头）"}
                        <select
                          aria-label={"字段" + (c || String(i + 1)) + "的类型"}
                          value={types[c] || "auto"}
                          onChange={(e) =>
                            setTypes({
                              ...types,
                              [c]: e.target.value as FieldType | "auto",
                            })
                          }
                        >
                          <option value="auto">自动识别</option>
                          <option value="number">数值</option>
                          <option value="date">日期</option>
                          <option value="text">文本</option>
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, i) => (
                    <tr key={i}>
                      {columns.map((_, j) => (
                        <td key={j}>{shown(row[j] ?? null).slice(0, 120)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="diagnostic-note">
              预览前五行。自动跳过空白行；表头必须非空且唯一。Excel日期按单元格格式读取，百分比数值保留底层小数；文本百分比在选择“数值”后转换。公式仅读取文件中已有缓存值，导入不会重新计算公式。
            </p>
            <div className="diagnostic-heading">
              <small>导入将替换当前数据集及其分析记录、字典与收藏。</small>
              <button className="button primary" onClick={confirm}>
                确认导入 <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
        {!busy && !selected && (
          <button className="button subtle" onClick={onClose}>
            返回重新选择文件
          </button>
        )}
      </div>
    </div>
  );
}
