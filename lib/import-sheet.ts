import type { Dataset, FieldType } from "./data-engine";
import { numeric, LIMITS } from "./data-engine";
export type ImportCell = string | number | boolean | Date | null;
export type Sheet = { sheet: string; data: ImportCell[][] };
export type ImportOptions = {
  header: number;
  types: Record<string, FieldType | "auto">;
};
function cellValue(value: ImportCell): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date)
    return Number.isFinite(value.getTime())
      ? value.toISOString().slice(0, 10)
      : null;
  if (typeof value === "boolean") return String(value);
  return typeof value === "number" && !Number.isFinite(value) ? null : value;
}
export function importSheet(
  sheet: Sheet,
  name: string,
  options: ImportOptions,
): Dataset {
  if (
    !Number.isInteger(options.header) ||
    options.header < 0 ||
    options.header >= sheet.data.length
  )
    throw new Error("请选择有效的表头行。");
  const raw = sheet.data[options.header];
  let width = raw.length;
  while (width && String(raw[width - 1] ?? "").trim() === "") width--;
  if (!width || width > LIMITS.columns)
    throw new Error("表头为空或字段数超过80列。");
  const columns = raw
    .slice(0, width)
    .map((v) => String(cellValue(v) ?? "").trim());
  if (
    columns.some(
      (c) =>
        !c ||
        c.length > 100 ||
        ["__proto__", "prototype", "constructor"].includes(c),
    ) ||
    new Set(columns).size !== columns.length
  )
    throw new Error(
      "表头需非空且唯一，不超过100字；请处理合并单元格和重复列名。",
    );
  const rows: Dataset["rows"] = [];
  for (const [index, line] of sheet.data.slice(options.header + 1).entries()) {
    if (line.every((v) => v === null || v === undefined || v === "")) continue;
    if (
      line.slice(width).some((v) => v !== null && v !== undefined && v !== "")
    )
      throw new Error(
        "第" +
          (index + options.header + 2) +
          "行存在无表头数据，请修正表头位置。",
      );
    const row: Dataset["rows"][number] = {};
    columns.forEach((c, i) => {
      let v = cellValue(line[i] ?? null),
        type = options.types[c];
      if (v !== null && v !== "") {
        if (type === "number") {
          const percent =
            typeof v === "string" && /^[-+]?\d+(\.\d+)?%$/.test(v.trim());
          const n = percent
            ? Number(String(v).trim().slice(0, -1)) / 100
            : numeric(v);
          if (n === null)
            throw new Error(
              "第" +
                (index + options.header + 2) +
                "行“" +
                c +
                "”无法转为数值，请选择文本或修正数据。",
            );
          v = n;
        }
        if (type === "date") {
          const s = String(v).replace(/\//g, "-");
          const d = new Date(s);
          if (
            !/^\d{4}-\d{1,2}-\d{1,2}$/.test(s) ||
            !Number.isFinite(d.getTime()) ||
            d.toISOString().slice(0, 10) !==
              s
                .split("-")
                .map((part, index) => (index ? part.padStart(2, "0") : part))
                .join("-")
          )
            throw new Error(
              "第" +
                (index + options.header + 2) +
                "行“" +
                c +
                "”无法转为日期。",
            );
          v = d.toISOString().slice(0, 10);
        }
        if (type === "text") v = String(v);
      }
      row[c] = v;
    });
    rows.push(row);
    if (rows.length > LIMITS.rows)
      throw new Error("最多支持20,000行，请拆分文件。");
  }
  if (!rows.length) throw new Error("表头之后没有数据。");
  const dataset: Dataset = {
    id: crypto.randomUUID(),
    name,
    columns,
    rows,
    types: Object.fromEntries(
      Object.entries(options.types).filter(([, v]) => v !== "auto"),
    ) as Record<string, FieldType>,
    source: "upload",
    createdAt: new Date().toISOString(),
  };
  if (new TextEncoder().encode(JSON.stringify(rows)).length > 30 * 1024 * 1024)
    throw new Error("展开后的数据过大，请拆分工作表。");
  return dataset;
}

/** Reject oversized ZIP expansion before reading workbook XML. */
export function checkWorkbookArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (
    let offset = view.byteLength - 22;
    offset >= Math.max(0, view.byteLength - 65557);
    offset--
  ) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("不是有效的XLSX工作簿。");
  const entries = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true);
  if (entries > 1500 || entries === 65535)
    throw new Error("工作簿文件过多，请精简后重试。");
  let cursor = offset,
    total = 0;
  for (let n = 0; n < entries; n++) {
    if (
      cursor + 46 > view.byteLength ||
      view.getUint32(cursor, true) !== 0x02014b50
    )
      throw new Error("工作簿目录损坏。");
    const bytes = view.getUint32(cursor + 24, true);
    total += bytes;
    if (bytes === 0xffffffff || total > 64 * 1024 * 1024)
      throw new Error("工作簿展开内容超过64 MB，请拆分文件。");
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
  }
}
