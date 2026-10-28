import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/chart-tests"); mkdirSync(out, { recursive: true });
for (const name of ["data-engine", "chart-presentation"]) {
  const code = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText.replace(/(["'])\.\/([a-z-]+)\1/g, '"./$2.mjs"');
  writeFileSync(path.join(out, name + ".mjs"), code);
}
const e = await import(pathToFileURL(path.join(out, "data-engine.mjs")));
const c = await import(pathToFileURL(path.join(out, "chart-presentation.mjs")));
let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }
const dataset = e.parseCSV("地区,销售额\n华东,100\n华东,200\n华南,600\n华北,100\n华北,");
const profile = e.profileDataset(dataset), plan = { ...e.defaultPlan(profile), groupBy: "地区", metric: "销售额", chart: "bar", aggregate: "sum", limit: 2 };
const result = e.executePlan(dataset, profile, plan);
test("shares describe only displayed Top N groups rather than hidden source totals", () => {
  assert.equal(result.points.length, 2); assert.equal(result.validRows, 4);
  assert.equal(c.displayedShare(result.points, result.points[0], "sum"), 600 / 900 * 100);
  assert.notEqual(c.displayedShare(result.points, result.points[0], "sum"), 60);
});
test("averages and extrema never acquire misleading share percentages", () => {
  for (const agg of ["mean", "max", "min"]) { assert.equal(c.displayedShare(result.points, result.points[0], agg), null); assert.match(c.pieUnavailable(result.points,agg),/不适合/); }
  assert.equal(c.pieUnavailable(result.points,"sum"),null);
});
test("negative, all-zero and nonfinite values refuse share calculations", () => {
  for (const values of [[1,-1], [0,0], [Infinity,1], [NaN,1]]) {
    const points = values.map((value,i) => ({name:String(i),value,count:1}));
    assert.equal(c.displayedShare(points, points[0], "sum"), null);
  }
  assert.equal(c.displayedShare([{name:"a",value:1,count:1}], {name:"a",value:1,count:1}, "count"),100);
});
test("table sorting leaves the calculation and original chart order untouched", () => {
  const before = JSON.stringify(result);
  assert.deepEqual(c.orderChartPoints(result.points,"asc").map(p=>p.value),[300,600]);
  assert.deepEqual(c.orderChartPoints(result.points,"original"),result.points);
  assert.equal(JSON.stringify(result),before);
});
test("brush ranges clamp indices, normalize direction and reject unready handles", () => {
  const points = ["2026-01","2026-02","2026-03"].map(name=>({name,value:1,count:1}));
  assert.deepEqual(c.chartRange(points,2,0),["2026-01","2026-03"]);
  assert.deepEqual(c.chartRange(points,-5,99),["2026-01","2026-03"]);
  assert.deepEqual(c.chartRange(points,1,1),["2026-02","2026-02"]);
  for (const args of [[[],0,1],[points,undefined,1],[points,0,NaN]]) assert.equal(c.chartRange(...args),null);
});
test("group CSV keeps actual aggregates, full names, units and valid row counts", () => {
  const exported = e.parseCSV(c.chartCSV(plan,result));
  assert.equal(exported.rows[0]["分组值"],"华南"); assert.equal(Number(exported.rows[0]["计算结果"]),600);
  assert.equal(Number(exported.rows[1]["有效记录数"]),2); assert.equal(exported.rows[0]["单位"],"元");
  assert.equal(exported.rows[0]["统计方式"],"合计");
});
test("export protects formula-like names, preserves negative numbers and avoids duplicate headers", () => {
  const edge = { ...result, points:[{name:'=HYPERLINK("https://example.com")',value:-12.5,count:1}] };
  const exported = e.parseCSV(c.chartCSV({...plan,groupBy:"有效记录数"},edge));
  assert.ok(exported.rows[0]["分组值"].startsWith("'=")); assert.equal(Number(exported.rows[0]["计算结果"]),-12.5);
  assert.equal(new Set(exported.columns).size,exported.columns.length);
});
test("category colors remain stable across sorting and chart copies", () => {
  assert.equal(c.chartColor("华南"),c.chartColor([..."华南"].join("")));
  assert.ok(c.CHART_COLORS.includes(c.chartColor("完整长名称😀")));
  const points = ["食品饮料","数码配件","美妆个护","服装鞋包","家居生活"].map(name=>({name,value:1,count:1}));
  const a=c.chartColors(points), b=c.chartColors([...points].reverse());
  assert.deepEqual(a,b); assert.equal(new Set(a.values()).size,points.length);
});
console.log(`Chart presentation: ${count} meaningful checks passed`);
