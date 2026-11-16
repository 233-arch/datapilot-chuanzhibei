import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/quality-audit-tests");
mkdirSync(out, { recursive: true });
for (const name of ["data-engine", "quality-audit"]) {
  const code = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText.replace(/(["'])\.\/([a-z-]+)\1/g, '"./$2.mjs"');
  writeFileSync(path.join(out, `${name}.mjs`), code);
}
const e = await import(pathToFileURL(path.join(out, "data-engine.mjs")));
const q = await import(pathToFileURL(path.join(out, "quality-audit.mjs")));
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
const dataset = { id: "qa", name: "质量验收.csv", columns: ["名称", "金额", "日期"], source: "upload", createdAt: "2026-11-10", types: { 名称: "text", 金额: "number", 日期: "date" }, rows: [
  { 名称: "A", 金额: "100", 日期: "2026-01-01" },
  { 名称: " A ", 金额: "100", 日期: "2026-01-01" },
  { 名称: "A", 金额: "100", 日期: "2026-01-01" },
  { 名称: null, 金额: null, 日期: null },
  { 名称: "=SUM(1,2)", 金额: "非法值", 日期: "2026-02-30" },
  { 名称: "B", 金额: " ", 日期: "2026-02-30T10:00:00Z" },
] };
const profile = e.profileDataset(dataset);
test("quality profile and row evidence agree, including impossible date and whitespace numeric", () => {
  const audit = q.auditQuality(dataset, profile);
  assert.deepEqual(audit.counts, { missing: 3, invalid: 4, duplicate: 1 });
  assert.equal(profile.missing, audit.counts.missing);
  assert.equal(profile.fields.reduce((n, f) => n + f.invalid, 0), audit.counts.invalid);
  assert.equal(profile.duplicates, audit.counts.duplicate);
  assert.equal(audit.affectedRows, 4);
  assert.equal(audit.samples.find(i => i.kind === "duplicate").row, 3);
  assert.match(audit.samples.find(i => i.kind === "duplicate").detail, /第 1 条/);
});
test("bounded evidence retains exact totals and field/type filters", () => {
  const audit = q.auditQuality(dataset, profile, { kind: "invalid", field: "日期" }, 1);
  assert.equal(audit.total, 2); assert.equal(audit.affectedRows, 2); assert.equal(audit.samples.length, 1);
  assert.equal(audit.samples[0].row, 5);
  assert.equal(q.auditQuality(dataset, profile, { kind: "duplicate", field: "名称" }).total, 0);
});
test("export is complete rather than limited to UI samples, with CSV formula escaping", () => {
  const large = { ...dataset, rows: Array.from({ length: 230 }, () => ({ 名称: "=1+1", 金额: "=SUM(1,2)", 日期: "2026-01-01" })) };
  const p = e.profileDataset(large);
  assert.equal(q.auditQuality(large, p, { kind: "invalid" }).samples.length, 200);
  const exported = q.qualityIssueExport(large, p, { kind: "invalid" });
  assert.equal(exported.rows.length, 230);
  assert.equal(exported.rows[229].记录序号, 230);
  assert.equal(e.parseCSV(e.toCSV(exported)).rows[0].原始值, "'=SUM(1,2)");
});
test("large export refuses silent truncation and permits field-scoped batches", () => {
  const large = { ...dataset, rows: Array.from({ length: 20000 }, () => ({ 名称: null, 金额: null, 日期: null })) };
  const p = e.profileDataset(large);
  assert.throws(() => q.qualityIssueExport(large, p, {}), /50,000/);
  assert.equal(q.qualityIssueExport(large, p, { field: "金额" }).rows.length, 20000);
});
test("cleaning preview matches applied engine output and preserves source and types", () => {
  const source = JSON.stringify(dataset);
  const options = { trim: true, deduplicate: true, fillMissing: true };
  const preview = q.previewCleaning(dataset, options);
  assert.equal(preview.removed, 2); assert.equal(preview.trimmed, 2); assert.equal(preview.filled, 1);
  assert.equal(preview.after.rowCount, 4);
  assert.equal(preview.after.missing, 3);
  assert.equal(preview.after.fields.reduce((n, f) => n + f.invalid, 0), 3);
  assert.equal(preview.next.rows[1].名称, "未填写");
  assert.equal(preview.next.rows[1].金额, null); assert.equal(preview.next.rows[1].日期, null);
  assert.deepEqual(preview.next.types, dataset.types);
  assert.deepEqual(preview.next.rows, e.cleanDataset(dataset, options).rows);
  assert.equal(JSON.stringify(dataset), source);
});
test("no-op and empty datasets are stable", () => {
  assert.equal(q.previewCleaning(dataset, { trim: false, deduplicate: false, fillMissing: false }).changed, false);
  const empty = { ...dataset, rows: [] };
  assert.equal(q.auditQuality(empty, e.profileDataset(empty)).total, 0);
  assert.equal(q.previewCleaning(empty, { trim: true, deduplicate: true, fillMissing: true }).changed, false);
});
test("valid leap days and valid ISO offsets remain accepted", () => {
  assert.equal(e.isDate("2024-02-29"), true);
  assert.equal(e.isDate("2024-02-29T23:10:00+08:00"), true);
  assert.equal(e.isDate("2026-02-29"), false);
  assert.equal(e.isDate("2026-02-30T10:00:00Z"), false);
  assert.equal(e.isDate("2026-13-01"), false);
});
console.log(`${passed} quality audit checks passed.`);
