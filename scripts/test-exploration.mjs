import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const target = path.resolve("work/exploration-tests");
mkdirSync(target, { recursive: true });
for (const name of ["data-engine", "agent", "exploration"]) {
  let source = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 },
  }).outputText;
  source = source.replace(/(["'])\.\/data-engine\1/g, '"./data-engine.mjs"');
  writeFileSync(path.join(target, `${name}.mjs`), source);
}
const e = await import(
    pathToFileURL(path.join(target, "data-engine.mjs")).href
  ),
  x = await import(pathToFileURL(path.join(target, "exploration.mjs")).href),
  a = await import(pathToFileURL(path.join(target, "agent.mjs")).href);
const d = e.parseCSV(
    readFileSync("docs/samples/innovation.csv", "utf8"),
    "innovation.csv",
  ),
  p = e.profileDataset(d);
const plan = {
  title: "地区销售额",
  chart: "bar",
  groupBy: "地区",
  metric: "销售额",
  aggregate: "sum",
  timeGrain: "month",
  sort: "desc",
  limit: 10,
};
let count = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS " + name);
  count++;
}
await test("Linked categorical and numeric conditions use AND", () => {
  const filters = [
    { field: "地区", operator: "eq", value: "华东" },
    { field: "销售额", operator: "gte", value: "130" },
  ];
  assert.equal(e.filterDataset(d, filters).rows.length, 2);
  assert.equal(e.executePlan(d, p, { ...plan, filters }).points[0].value, 290);
});
await test("Date interval boundaries are calendar based", () => {
  const f = [
    { field: "日期", operator: "gte", value: "2026-02-01" },
    { field: "日期", operator: "lte", value: "2026-02-03" },
  ];
  assert.equal(e.filterDataset(d, f).rows.length, 3);
});
await test("Scope reset restores all records and never mutates input", () => {
  const before = JSON.stringify(d);
  e.filterDataset(d, [{ field: "地区", operator: "eq", value: "华东" }]);
  assert.equal(e.filterDataset(d, []).rows.length, 8);
  assert.equal(JSON.stringify(d), before);
});
await test("New same-field equality replaces old equality", () => {
  const f = e.mergeFilters(
    [{ field: "地区", operator: "eq", value: "华东" }],
    [{ field: "地区", operator: "eq", value: "华南" }],
  );
  assert.equal(f.length, 1);
  assert.equal(e.filterDataset(d, f).rows.length, 4);
  assert.equal(f[0].value, "华南");
});
await test("Untrusted filters and oversized condition lists are rejected", () => {
  assert.throws(() =>
    e.filterDataset(d, [{ field: "不存在", operator: "eq", value: "x" }]),
  );
  assert.throws(() =>
    e.validateFilters(
      Array(9).fill({ field: "地区", operator: "eq", value: "x" }),
      p.fields,
    ),
  );
  assert.throws(() =>
    e.filterDataset(d, [
      { field: "地区", operator: "bucket", value: "2026-01" },
    ]),
  );
});
await test("Graph drilldown recovers exact month records", () => {
  const rows = x.evidenceRows(d, p, { ...plan, groupBy: "日期" }, "2026-01");
  assert.equal(rows.rows.length, 4);
  assert.equal(
    rows.rows.reduce((s, r) => s + e.numeric(r.销售额), 0),
    460,
  );
});
await test("Missing group evidence matches graph semantics", () => {
  const missing = e.parseCSV("地区,金额\n,1\n未填写,2\n华东,3");
  const pp = e.profileDataset(missing);
  assert.equal(
    x.evidenceRows(missing, pp, { ...plan, metric: "金额" }, "未填写").rows
      .length,
    2,
  );
  assert.equal(
    e.filterDataset(missing, [
      { field: "地区", operator: "missing", value: "" },
    ]).rows.length,
    1,
  );
});
await test("IQR identifies actual outlier without deleting it", () => {
  const before = JSON.stringify(d),
    r = x.detectAnomalies(d, "销售额", 1.5);
  assert.equal(r.anomalies.length, 1);
  assert.equal(r.anomalies[0].value, 4000);
  assert.equal(r.anomalies[0].index, 7);
  assert.equal(JSON.stringify(d), before);
});
await test("Anomaly sensitivity and insufficient sample handling", () => {
  assert.equal(
    x.detectAnomalies({ ...d, rows: d.rows.slice(0, 3) }, "销售额")
      .insufficient,
    true,
  );
  assert.throws(() => x.detectAnomalies(d, "销售额", 99));
  const sorted = [1, 2, 3, 4];
  assert.equal(x.quantile(sorted, 0.25), 1.75);
});
await test("Scenario is a pure, conditional arithmetic transformation", () => {
  const before = JSON.stringify(d);
  const r = x.simulateScenario(d, "销售额", 10, {
    field: "地区",
    operator: "eq",
    value: "华东",
  });
  assert.equal(r.baseline, 4910);
  assert.equal(r.affected, 4);
  assert.ok(Math.abs(r.delta - 50) < 1e-8);
  assert.ok(Math.abs(r.simulated - 4960) < 1e-8);
  assert.equal(r.dataset.rows[7].销售额, "4000");
  assert.equal(JSON.stringify(d), before);
});
await test("Scenario preserves source sample even when metric changes", () => {
  const scoped = e.filterDataset(d, [
    { field: "销售额", operator: "gte", value: "140" },
  ]);
  const r = x.simulateScenario(scoped, "销售额", -50);
  assert.equal(r.dataset.rows.length, 4);
  assert.equal(r.valid, 4);
  assert.throws(() => x.simulateScenario(d, "销售额", -100));
});
const pin = (id, plan) => ({
  id,
  name: id,
  plan,
  createdAt: "2026-10-22",
  note: "",
});
await test("Notebook comparison refuses incompatible calculations", () => {
  assert.equal(
    x.compareInsights(
      d,
      p,
      pin("a", plan),
      pin("b", { ...plan, aggregate: "mean" }),
    ).compatible,
    false,
  );
});
await test("Notebook comparison does not fabricate zero for missing groups", () => {
  const r = x.compareInsights(
    d,
    p,
    pin("a", plan),
    pin("b", {
      ...plan,
      filters: [{ field: "地区", operator: "eq", value: "华东" }],
    }),
  );
  assert.equal(r.compatible, true);
  const missing = r.points.find((p) => p.name === "华南");
  assert.equal(missing.after, null);
  assert.equal(missing.delta, null);
});
await test("Contextual demo follow-up preserves metric and dimension", async () => {
  const previous = { ...plan, metric: "利润", aggregate: "sum" };
  const r = await a.createPlan("改成均值", p, {}, fetch, {
    previousPlan: previous,
  });
  assert.equal(r.plan.metric, "利润");
  assert.equal(r.plan.groupBy, "地区");
  assert.equal(r.plan.aggregate, "mean");
  const modeled = await a.createPlan(
    "改成均值",
    p,
    { key: "test-only-placeholder" },
    async (_url, options) => {
      const request = JSON.parse(options.body);
      const context = JSON.parse(request.messages[1].content);
      assert.deepEqual(context.previousPlan, previous);
      assert.equal(context.dataset.rows, undefined);
      assert.equal(request.tool_choice.function.name, "create_analysis_plan");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "create_analysis_plan",
                      arguments: JSON.stringify(r.plan),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
    { previousPlan: previous },
  );
  assert.equal(modeled.mode, "model");
  assert.equal(modeled.plan.metric, "利润");
});
await test("Contextual category follow-up changes filter without losing metric", async () => {
  const previous = {
    ...plan,
    metric: "利润",
    aggregate: "mean",
    filters: [{ field: "地区", operator: "eq", value: "华东" }],
  };
  const r = await a.createPlan("只看华南", p, {}, fetch, {
    previousPlan: previous,
  });
  assert.equal(r.plan.metric, "利润");
  assert.equal(e.filtersForPlan(r.plan)[0].value, "华南");
});
console.log(`\n${count} exploration checks passed.`);
