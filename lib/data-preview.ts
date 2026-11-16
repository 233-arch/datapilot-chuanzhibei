import { numeric, type Cell, type DataRow, type Dataset, type FieldType, type Profile } from "./data-engine";

export type PreviewSort = { field: string; direction: "asc" | "desc" } | null;
export type PreviewRow = { row: DataRow; sourceIndex: number };

export function isPreviewMissing(value: Cell | undefined): boolean {
  return value == null || (typeof value === "string" && !value.trim());
}

function dateValue(value: Cell): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const parts = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(.*)$/);
  if (!parts) return null;
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(0, 0, 0, 0);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  if (!parts[4]) return calendar.getTime();
  if (!/^T/.test(parts[4])) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function comparable(value: Cell | undefined, type: FieldType): { rank: number; value: string | number } {
  if (isPreviewMissing(value)) return { rank: 2, value: "" };
  if (type === "number" || type === "date") {
    const result = type === "number" ? numeric(value ?? null) : dateValue(value ?? null);
    return result === null ? { rank: 1, value: String(value) } : { rank: 0, value: result };
  }
  return { rank: 0, value: String(value) };
}

/** Search the complete current scope; never mutate its rows or reorder the source array. */
export function previewRows(dataset: Dataset, profile: Profile, query: string, sort: PreviewSort): PreviewRow[] {
  const needle = query.trim().toLowerCase();
  const result = dataset.rows.flatMap((row, sourceIndex) => {
    const matches = !needle || dataset.columns.some(column => String(row[column] ?? "").toLowerCase().includes(needle));
    return matches ? [{ row, sourceIndex }] : [];
  });
  if (!sort || !dataset.columns.includes(sort.field)) return result;
  const type = profile.fields.find(field => field.name === sort.field)?.type ?? "text";
  const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
  // Calculate numeric/date keys once per row, rather than on every comparison.
  const keys = new Map(result.map(item => [item.sourceIndex, comparable(item.row[sort.field], type)]));
  return result.sort((a, b) => {
    const left = keys.get(a.sourceIndex)!, right = keys.get(b.sourceIndex)!;
    if (left.rank !== right.rank) return left.rank - right.rank;
    // Invalid values and missing cells keep their source order in either direction.
    if (left.rank > 0) return a.sourceIndex - b.sourceIndex;
    const comparison = typeof left.value === "number" && typeof right.value === "number"
      ? left.value - right.value : collator.compare(String(left.value), String(right.value));
    return (sort.direction === "asc" ? comparison : -comparison) || a.sourceIndex - b.sourceIndex;
  });
}

export function previewPage(total: number, requestedPage: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * size;
  return { page, pages, start, end: Math.min(start + size, total) };
}

/** Export all matched rows in visible order, independently of the current page. */
export function previewExport(dataset: Dataset, rows: PreviewRow[], visibleColumns: string[]): Dataset {
  const requested = new Set(visibleColumns);
  const columns = dataset.columns.filter(column => requested.has(column));
  return { ...dataset, name: `${dataset.name.replace(/\.[^.]+$/, "")}_当前结果.csv`, columns, rows: rows.map(item => item.row) };
}
