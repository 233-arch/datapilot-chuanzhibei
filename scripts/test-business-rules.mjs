import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/business-rule-tests"); mkdirSync(out, { recursive: true });
for (const name of ["data-engine", "business-rules", "diagnostics", "workbench", "knowledge", "workspace-tools"]) {
  const code = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText.replace(/(["'])\.\/([a-z-]+)\1/g, '"./$2.mjs"');
  writeFileSync(path.join(out, `${name}.mjs`), code);
}
const r = await import(pathToFileURL(path.join(out, "business-rules.mjs")));
const e = await import(pathToFileURL(path.join(out, "data-engine.mjs")));
const t = await import(pathToFileURL(path.join(out, "workspace-tools.mjs")));
let count = 0; function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }
const dataset = { id: "rules", name: "业务.csv", columns: ["编号", "金额", "渠道"], source: "upload", createdAt: "2026-11-13", rows: [
  { 编号: "A", 金额: 0, 渠道: " 门店 " }, { 编号: " A ", 金额: 100, 渠道: "线上" },
  { 编号: "B", 金额: -1, 渠道: "其他" }, { 编号: "", 金额: null, 渠道: " " },
  { 编号: "C", 金额: "错误", 渠道: "online" }, { 编号: "D", 金额: "1,000", 渠道: "Online" },
] };
const make = (kind, field = "编号", extra = {}) => ({ id: kind, field, kind, ...extra });
test("required includes whitespace but preserves zero", () => {
  assert.equal(r.evaluateRule(dataset, make("required")).failed, 1);
  const result = r.evaluateRule(dataset, make("required", "金额")); assert.equal(result.failed, 1); assert.equal(result.checked, 6); assert.equal(result.skipped, 0);
});
test("unique flags all duplicate members, trimming text and skipping empties", () => {
  const result = r.evaluateRule(dataset, make("unique"));
  assert.deepEqual(result.issues.map(x => x.row), [1, 2]); assert.equal(result.skipped, 1); assert.equal(result.passRate, 60);
});
test("range is inclusive, rejects invalid numbers and distinguishes skipped nulls", () => {
  const result = r.evaluateRule(dataset, make("range", "金额", { min: 0, max: 100 }));
  assert.deepEqual(result.issues.map(x => x.row), [3, 5, 6]); assert.equal(result.passed, 2); assert.equal(result.skipped, 1);
  assert.equal(r.evaluateRule(dataset, make("range", "金额", { min: 0 })).passed, 3);
});
test("allowed values trim whitespace and remain case sensitive", () => {
  const result = r.evaluateRule(dataset, make("allowed", "渠道", { values: ["门店", "线上", "online"] }));
  assert.deepEqual(result.issues.map(x => x.row), [3, 6]); assert.equal(result.skipped, 1);
});
test("validation rejects reversed, nonfinite, missing and oversized configurations", () => {
  for (const rule of [make("range", "金额"), make("range", "金额", { min: 2, max: 1 }), make("range", "金额", { max: Infinity }), make("allowed", "渠道", { values: [] }), make("allowed", "渠道", { values: Array(101).fill("a") }), make("required", "不存在"), make("__proto__")]) assert.throws(() => r.validateRule(rule, dataset.columns));
});
test("evidence cap does not truncate counts or full export and input is unchanged", () => {
  const original = JSON.stringify(dataset); const rule = make("range", "金额", { max: -100 });
  assert.equal(r.evaluateRule(dataset, rule, 1).issues.length, 1); assert.equal(r.evaluateRule(dataset, rule, 1).failed, 5);
  assert.equal(r.exportRuleIssues(dataset, [rule]).rows.length, 5); assert.equal(JSON.stringify(dataset), original);
});
test("empty and all-skipped datasets never display a perfect pass rate", () => {
  assert.equal(r.evaluateRule({ ...dataset, rows: [] }, make("unique")).passRate, null);
  const result = r.evaluateRule({ ...dataset, rows: [{ 编号: null }] }, make("unique")); assert.equal(result.passRate, null); assert.equal(result.skipped, 1);
});
test("oversized issue export explicitly refuses silent truncation", () => {
  const big = { ...dataset, rows: Array.from({ length: 20000 }, () => ({ 编号: null, 金额: null, 渠道: null })) };
  assert.throws(() => r.exportRuleIssues(big, dataset.columns.map((field, i) => make("required", field, { id: String(i) }))), /50,000/);
});
test("CSV escaping and report markup preserve hostile literal content safely", () => {
  const hostile = { ...dataset, name: "<script>|x.csv", rows: [{ 编号: "=1+1" }] };
  const rule = make("allowed", "编号", { values: ["ok"] });
  assert.match(e.toCSV(r.exportRuleIssues(hostile, [rule])), /'=1\+1/);
  assert.ok(!r.ruleReport(hostile, [rule]).includes("<script>"));
});
test("workspace restores valid rules, drops stale fields, and isolates datasets", () => {
  const profile = e.profileDataset(dataset); const rule = make("required");
  const saved = { ...t.defaultTools(dataset, profile), rules: [rule, make("unique", "不存在")] };
  assert.deepEqual(t.restoreTools(saved, dataset, profile).rules, [rule]);
  assert.deepEqual(t.restoreTools(saved, { ...dataset, id: "new" }, profile).rules, []);
  assert.deepEqual(t.restoreTools({ datasetId: dataset.id }, dataset, profile).rules, []);
  const cleaned = e.cleanDataset(dataset, { deduplicate: true, trim: true, fillMissing: false });
  assert.equal(r.evaluateRule(cleaned, rule).failed, 1);
});
console.log(`${count} business-rule checks passed.`);
