import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";

const out = path.resolve("work/data-preview-tests");
mkdirSync(out, { recursive: true });
for (const name of ["data-engine", "data-preview"]) {
  const code = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText.replace(/(["'])\.\/([a-z-]+)\1/g, '"./$2.mjs"');
  writeFileSync(path.join(out, `${name}.mjs`), code);
}
const p = await import(pathToFileURL(path.join(out, "data-preview.mjs")));
const e = await import(pathToFileURL(path.join(out, "data-engine.mjs")));
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
const dataset = { id: "scope", name: "销售.csv", columns: ["名称", "金额", "日期"], rows: [
  { 名称: "Alpha", 金额: "1,200", 日期: "2026/10/2" },
  { 名称: "beta", 金额: "9", 日期: "2026-2-10" },
  { 名称: "Alpha 2", 金额: null, 日期: "2026-02-30" },
  { 名称: "Gamma", 金额: "-20", 日期: "2025-12-31T23:00:00Z" },
  { 名称: "Other", 金额: "非法", 日期: null },
  { 名称: "Same", 金额: "9", 日期: "2026-2-10" },
  { 名称: "Empty", 金额: " ", 日期: "" },
], source: "upload", createdAt: "2026-11-07" };
const profile = { fields: [{ name: "名称", type: "text" }, { name: "金额", type: "number" }, { name: "日期", type: "date" }] };
test("search covers all source columns and is case insensitive with literal punctuation", () => {
  assert.deepEqual(p.previewRows(dataset, profile, " ALPHA ", null).map(x => x.sourceIndex), [0, 2]);
  assert.deepEqual(p.previewRows(dataset, profile, "2026/10/2", null).map(x => x.sourceIndex), [0]);
  assert.equal(p.previewRows(dataset, profile, "[", null).length, 0);
});
test("numeric sorting handles formatted strings, negatives, ties, invalids and missing cells", () => {
  assert.deepEqual(p.previewRows(dataset, profile, "", { field: "金额", direction: "asc" }).map(x => x.sourceIndex), [3, 1, 5, 0, 4, 2, 6]);
  assert.deepEqual(p.previewRows(dataset, profile, "", { field: "金额", direction: "desc" }).map(x => x.sourceIndex), [0, 1, 5, 3, 4, 2, 6]);
});
test("date sorting uses real chronological values and places impossible dates after valid ones", () => {
  assert.deepEqual(p.previewRows(dataset, profile, "", { field: "日期", direction: "asc" }).map(x => x.sourceIndex), [3, 1, 5, 0, 2, 4, 6]);
  assert.deepEqual(p.previewRows(dataset, profile, "", { field: "日期", direction: "desc" }).map(x => x.sourceIndex), [0, 1, 5, 3, 2, 4, 6]);
});
test("filtering and sorting retain original scope row numbers and leave the dataset untouched", () => {
  const before = JSON.stringify(dataset);
  const result = p.previewRows(dataset, profile, "Alpha", { field: "金额", direction: "desc" });
  assert.deepEqual(result.map(x => x.sourceIndex), [0, 2]);
  assert.equal(result[0].row, dataset.rows[0]);
  assert.equal(JSON.stringify(dataset), before);
  assert.deepEqual(p.previewRows(dataset, profile, "", { field: "不存在", direction: "asc" }).map(x => x.sourceIndex), [0, 1, 2, 3, 4, 5, 6]);
});
test("pagination clamps a prior page after the current scope shrinks", () => {
  assert.deepEqual(p.previewPage(6, 20, 12), { page: 1, pages: 1, start: 0, end: 6 });
  assert.deepEqual(p.previewPage(28, 2, 12), { page: 2, pages: 3, start: 12, end: 24 });
  assert.deepEqual(p.previewPage(0, 20, 12), { page: 1, pages: 1, start: 0, end: 0 });
});
test("export contains all matching rows in sorted order and only selected fields", () => {
  const before = JSON.stringify(dataset);
  const results = p.previewRows(dataset, profile, "", { field: "金额", direction: "asc" });
  const exported = p.previewExport(dataset, results, ["金额", "名称", "外部字段"]);
  assert.equal(exported.name, "销售_当前结果.csv");
  assert.deepEqual(exported.columns, ["名称", "金额"]);
  assert.equal(exported.rows.length, 7);
  assert.equal(exported.rows[0].名称, "Gamma");
  assert.equal(e.toCSV(exported).split("\r\n").length, 8);
  assert.ok(!e.toCSV(exported).includes("日期"));
  assert.equal(JSON.stringify(dataset), before);
  assert.equal(p.previewExport(dataset, p.previewRows(dataset, profile, "Alpha", null), ["名称"]).rows.length, 2);
});
test("export preserves CSV escaping and protects formula-like text", () => {
  const sample = { ...dataset, columns: ["名称", "金额"], rows: [{ 名称: '=HYPERLINK("https://example.com")', 金额: -20 }] };
  const csv = e.toCSV(p.previewExport(sample, p.previewRows(sample, profile, "", null), sample.columns));
  const parsed = e.parseCSV(csv);
  assert.ok(parsed.rows[0].名称.startsWith("'="));
  assert.equal(Number(parsed.rows[0].金额), -20);
});
test("missing display agrees with whitespace and absent cells without hiding zero", () => {
  for (const value of [null, undefined, "", "  "]) assert.equal(p.isPreviewMissing(value), true);
  for (const value of [0, "0", "有效"]) assert.equal(p.isPreviewMissing(value), false);
});
console.log(`\n${count} data-preview checks passed.`);
