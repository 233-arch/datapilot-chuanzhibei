import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/local-assistant-tests"); mkdirSync(out, { recursive: true });
for (const name of ["data-engine", "local-assistant"]) {
  const code = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 },
  }).outputText.replace(/(["'])\.\/([a-z-]+)\1/g, '"./$2.mjs"');
  writeFileSync(path.join(out, name + ".mjs"), code);
}
const e = await import(pathToFileURL(path.join(out, "data-engine.mjs")));
const { localAssistant: ask } = await import(pathToFileURL(path.join(out, "local-assistant.mjs")));
const data = e.parseCSV(readFileSync("docs/samples/innovation.csv", "utf8")), profile = e.profileDataset(data), base = e.defaultPlan(profile);
const plan = (q, previous = base, d = data, p = profile) => { const r = ask(q, d, p, previous); assert.equal(r.kind, "plan", JSON.stringify(r)); return r.plan; };
const answer = (q, previous = base, d = data, p = profile) => { const r = ask(q, d, p, previous); assert.equal(r.kind, "reply"); return r; };
let count = 0;
function test(name, run) { run(); count++; console.log("PASS " + name); }
test("overview and direct metric totals use actual local rows", () => {
  assert.match(answer("数据概览").lines.join(" "), /4,910/);
  assert.match(answer("销售额合计").lines.join(" "), /4,910/);
  assert.match(answer("利润均值").lines.join(" "), /61.38/);
});
test("three-turn mean and category follow-ups preserve metric, aggregation and exact values", () => {
  let p = plan("各地区利润合计"); p = plan("改成均值", p); p = plan("只看华南", p);
  assert.equal(p.metric, "利润"); assert.equal(p.aggregate, "mean"); assert.equal(p.groupBy, "地区");
  assert.equal(e.executePlan(data, profile, p).points[0].value, 110.25);
});
test("explicit sum restores aggregation after mean", () => {
  const p = plan("改成合计", plan("改成均值", plan("各地区利润合计")));
  assert.equal(p.aggregate, "sum"); assert.equal(p.metric, "利润");
});
test("category filtering finds values outside the five profile top values", () => {
  const d = e.parseCSV("地区,金额\n" + Array.from({ length: 10 }, (_, i) => `区域${i},${i + 1}`).join("\n")), p = e.profileDataset(d);
  const r = plan("只看区域9", e.defaultPlan(p), d, p);
  assert.equal(e.executePlan(d, p, r).matchedRows, 1); assert.equal(r.filters[0].value, "区域9");
});
test("replacing a category and clearing filters do not retain hidden old scope", () => {
  const east = plan("只看华东"), south = plan("只看华南", east);
  assert.equal(south.filters.length, 1); assert.equal(south.filters[0].value, "华南");
  const reset = plan("清除筛选", south); assert.deepEqual(reset.filters, []); assert.equal(e.executePlan(data, profile, reset).matchedRows, 8);
});
test("two numeric bounds are both applied rather than dropping the upper bound", () => {
  const p = plan("按地区统计销售额大于等于110小于等于140");
  assert.equal(p.filters.length, 2); assert.equal(e.executePlan(data, profile, p).matchedRows, 4);
  assert.equal(e.executePlan(data, profile, p).points.reduce((sum, point) => sum + point.value, 0), 500);
});
test("quality summary counts invalid-only numeric cells and respects declared field types", () => {
  const d = e.parseCSV("地区,金额\n华东,10\n华南,错误", "x"); d.types = { 金额: "number" };
  assert.match(answer("质量摘要", e.defaultPlan(e.profileDataset(d)), d, e.profileDataset(d)).lines.join(" "), /无效值 1/);
});
test("scoped overview recomputes totals and fields expose aliases without inventing units", () => {
  const p = plan("只看华东"); assert.match(answer("数据概览", p).lines.join(" "), /500/);
  const enriched = { ...profile, fields: profile.fields.map(f => f.name === "销售额" ? { ...f, aliases: ["营收"], unit: "元" } : f) };
  assert.match(answer("查看字段", base, data, enriched).lines.join(" "), /营收/);
  assert.match(answer("营收合计", base, data, enriched).lines.join(" "), /4,910/);
});
test("help, report and period questions return working destination actions", () => {
  assert.equal(answer("你好").action, "help"); assert.equal(answer("导出报告").action, "delivery"); assert.equal(answer("同比分析").action, "diagnostics");
});
test("unsupported forecasting, unknown fields, unknown categories and ratios never fabricate plans", () => {
  for (const q of ["预测下月销售额", "为什么下降", "执行代码删除数据", "按省份统计销售额", "按地区统计营业额合计", "只看不存在地区", "利润率", "销售额大于100", "讲个故事", "2026年1月销售额", "华西销售额合计"]) {
    const r = ask(q, data, profile, base); assert.equal(r.kind, "reply", q); assert.ok(!r.lines.some(line => line.startsWith("结果：")), q);
  }
});
test("category collisions ask for a field and honor explicit field names", () => {
  const d = e.parseCSV("渠道,来源,金额\n线上,线上,10\n线下,线下,20"), p = e.profileDataset(d), b = e.defaultPlan(p);
  assert.equal(ask("只看线上", d, p, b).kind, "reply");
  const r = plan("只看渠道线上", b, d, p); assert.equal(r.filters.length, 1); assert.equal(r.filters[0].field, "渠道");
});
test("no-date tables refuse trends and text-only tables can count", () => {
  const d = e.parseCSV("地区\n华东\n华南"), p = e.profileDataset(d), b = e.defaultPlan(p);
  assert.equal(ask("按月看趋势", d, p, b).kind, "reply"); assert.equal(plan("按地区统计记录数", b, d, p).aggregate, "count");
});
test("chart-only follow-ups preserve the current grouping", () => {
  const p = plan("按渠道统计销售额合计"); assert.equal(plan("改成饼图", p).groupBy, "渠道");
});
test("local answers never call network or mutate the source and active plan", () => {
  const before = JSON.stringify({ data, base }), original = globalThis.fetch;
  globalThis.fetch = () => assert.fail("local assistant must not request a network service");
  try { for (const q of ["数据概览", "查看字段", "质量摘要", "各地区利润合计", "只看华南", "清除筛选"]) ask(q, data, profile, base); }
  finally { globalThis.fetch = original; }
  assert.equal(JSON.stringify({ data, base }), before);
});
test("field definitions come only from the dictionary, with undefined business meaning stated", () => {
  assert.match(answer("销售额是什么").lines.join(" "), /不会猜测/);
  const enriched = { ...profile, fields: profile.fields.map(f => f.name === "销售额" ? { ...f, description: "样本订单金额", unit: "元" } : f) };
  assert.match(answer("销售额是什么", base, data, enriched).lines.join(" "), /样本订单金额/);
});
console.log(`Local assistant: ${count} meaningful checks passed`);
