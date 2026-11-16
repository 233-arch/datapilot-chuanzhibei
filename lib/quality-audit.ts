import { cleanDataset, isDate, numeric, profileDataset, type Cell, type Dataset, type Profile } from "./data-engine";

export type IssueKind = "missing" | "invalid" | "duplicate";
export type QualityIssue = { row: number; field: string; kind: IssueKind; value: Cell; detail: string };
export type QualityQuery = { kind?: IssueKind; field?: string };
export const issueLabels: Record<IssueKind, string> = { missing: "缺失值", invalid: "类型异常", duplicate: "重复记录" };
export const QUALITY_EXPORT_LIMIT = 50000;

/** One deterministic pass; bound retained evidence, while counting every match. */
export function auditQuality(dataset: Dataset, profile: Profile, query: QualityQuery = {}, limit = 200) {
  const samples: QualityIssue[] = [];
  const counts: Record<IssueKind, number> = { missing: 0, invalid: 0, duplicate: 0 };
  const affectedRows = new Set<number>();
  const seen = new Map<string, number>();
  let total = 0;
  const add = (issue: QualityIssue) => {
    counts[issue.kind]++;
    if ((query.kind && query.kind !== issue.kind) || (query.field && query.field !== issue.field)) return;
    total++;
    affectedRows.add(issue.row);
    if (samples.length < limit) samples.push(issue);
  };
  dataset.rows.forEach((row, index) => {
    const rowNumber = index + 1;
    for (const field of profile.fields) {
      const value = row[field.name] ?? null;
      if (value === null || value === "") add({ row: rowNumber, field: field.name, kind: "missing", value, detail: "保留空值；请核对原始来源，不自动补零。" });
      else if ((field.type === "number" && numeric(value) === null) || (field.type === "date" && !isDate(value)))
        add({ row: rowNumber, field: field.name, kind: "invalid", value, detail: field.type === "date" ? "不能解析为有效日期，请核对日期和字段类型。" : "不能解析为有限数值，数值聚合会排除此单元格。" });
    }
    const key = JSON.stringify(dataset.columns.map(column => row[column]));
    const original = seen.get(key);
    if (original !== undefined) add({ row: rowNumber, field: "", kind: "duplicate", value: null, detail: `与第 ${original} 条记录完全相同；确认业务含义后再去重。` });
    else seen.set(key, rowNumber);
  });
  return { samples, counts, total, affectedRows: affectedRows.size };
}

/** Export the complete matching issue list, independent of UI evidence/page limits. */
export function qualityIssueExport(dataset: Dataset, profile: Profile, query: QualityQuery): Dataset {
  const audit = auditQuality(dataset, profile, query, QUALITY_EXPORT_LIMIT);
  if (audit.total > QUALITY_EXPORT_LIMIT) throw new Error("问题超过 50,000 项，请选择问题类型和字段后分批导出。");
  return { ...dataset, id: `${dataset.id}-quality`, name: `${dataset.name.replace(/\.[^.]+$/, "")}_问题清单.csv`, types: undefined,
    columns: ["记录序号", "问题类型", "字段", "原始值", "核对建议"],
    rows: audit.samples.map(issue => ({ 记录序号: issue.row, 问题类型: issueLabels[issue.kind], 字段: issue.field || "整行", 原始值: issue.value, 核对建议: issue.detail })) };
}

export function previewCleaning(dataset: Dataset, options: Parameters<typeof cleanDataset>[1]) {
  const next = cleanDataset(dataset, options);
  const before = profileDataset(dataset);
  const after = profileDataset(next);
  let trimmed = 0, filled = 0;
  const textFields = new Set(before.fields.filter(field => field.type === "text").map(field => field.name));
  for (const row of dataset.rows) for (const column of dataset.columns) {
    const original = row[column];
    const value = options.trim && typeof original === "string" ? original.trim() : original;
    if (value !== original) trimmed++;
    if (options.fillMissing && textFields.has(column) && (value === null || value === "")) filled++;
  }
  const removed = dataset.rows.length - next.rows.length;
  return { next, before, after, removed, trimmed, filled, changed: Boolean(removed || trimmed || filled) };
}
