import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const target = path.resolve("work/kit-tests");
mkdirSync(target, { recursive: true });
for (const name of ["data-engine", "agent", "exploration", "business-rules", "report-bundle", "workspace-kit"]) {
  const source = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 },
  }).outputText.replace(/(["'])\.\/(data-engine|exploration|business-rules)\1/g, '"./$2.mjs"');
  writeFileSync(path.join(target, `${name}.mjs`), source);
}
const e = await import(pathToFileURL(path.join(target, "data-engine.mjs")));
const a = await import(pathToFileURL(path.join(target, "agent.mjs")));
const k = await import(pathToFileURL(path.join(target, "workspace-kit.mjs")));
const reports = await import(pathToFileURL(path.join(target, "report-bundle.mjs")));
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
const dataset = e.parseCSV(
  readFileSync("docs/samples/innovation.csv", "utf8"),
  "innovation.csv",
);
const baseProfile = e.profileDataset(dataset);
const dictionary = {
  销售额: {
    description: "已收款的实际销售金额",
    aliases: ["营收"],
    unit: "人民币元",
  },
};
const profile = k.enrichProfile(
  baseProfile,
  k.validateDictionary(dictionary, dataset.columns),
);
const plan = {
  ...e.defaultPlan(profile),
  groupBy: "地区",
  metric: "销售额",
  chart: "bar",
  aggregate: "sum",
};
await test("Dictionary rejects invented fields and ambiguous aliases", () => {
  assert.throws(() =>
    k.validateDictionary({ 不存在: dictionary.销售额 }, dataset.columns),
  );
  assert.throws(() =>
    k.validateDictionary(
      { 销售额: { ...dictionary.销售额, aliases: ["地区"] } },
      dataset.columns,
    ),
  );
  assert.throws(() =>
    k.validateDictionary(
      { 销售额: dictionary.销售额, 利润: { ...dictionary.销售额 } },
      dataset.columns,
    ),
  );
});
await test("Dictionary limits untrusted metadata and keeps source statistics", () => {
  assert.throws(() =>
    k.validateDictionary(
      { 销售额: { ...dictionary.销售额, description: "x".repeat(301) } },
      dataset.columns,
    ),
  );
  assert.equal(
    profile.fields.find((f) => f.name === "销售额").mean,
    baseProfile.fields.find((f) => f.name === "销售额").mean,
  );
  assert.equal(
    baseProfile.fields.find((f) => f.name === "销售额").aliases,
    undefined,
  );
});
await test("Alias questions resolve to real fields in demo and retrieval", async () => {
  const answer = await a.createPlan("按地区查看营收", profile, {});
  assert.equal(answer.plan.metric, "销售额");
  assert.equal(a.retrieveFields("营收", profile)[0].name, "销售额");
  assert.equal(e.executePlan(dataset, profile, plan).unit, "人民币元");
});
await test("Model receives definitions and prior fields beyond the 24-field window", async () => {
  const many = {
    ...profile,
    fields: [
      ...Array.from({ length: 30 }, (_, i) => ({
        ...profile.fields[0],
        name: `列${i}`,
      })),
      ...profile.fields,
    ],
  };
  await a.createPlan(
    "改成均值",
    many,
    { key: "test-placeholder" },
    async (_url, init) => {
      const payload = JSON.parse(init.body),
        context = JSON.parse(payload.messages[1].content);
      const money = context.dataset.fields.find((f) => f.name === "销售额");
      assert.equal(money.description, dictionary.销售额.description);
      assert.ok(context.dataset.fields.some((f) => f.name === "地区"));
      assert.equal(context.dataset.fields.length, 24);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "create_analysis_plan",
                      arguments: JSON.stringify(plan),
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
    },
    { previousPlan: plan },
  );
});
await test("Drill-down keeps target category and aggregation", () => {
  const next = k.drillPlan(
    { ...plan, aggregate: "mean" },
    "华东",
    "产品类别",
    profile,
  );
  const result = e.executePlan(dataset, profile, next);
  assert.equal(next.aggregate, "mean");
  assert.equal(result.matchedRows, 4);
  assert.equal(next.groupBy, "产品类别");
  assert.throws(() => k.drillPlan(plan, "华东", "地区", profile));
});
await test("Time drill-down preserves calendar month evidence", () => {
  const next = k.drillPlan(
    { ...plan, groupBy: "日期", timeGrain: "month" },
    "2026-01",
    "地区",
    profile,
  );
  assert.equal(e.executePlan(dataset, profile, next).matchedRows, 4);
});
const pin = {
  id: "pin",
  name: "地区营收",
  note: "核对口径",
  createdAt: "2026-10-22",
  plan,
};
let recipe;
await test("Recipe exports configuration and hash without raw rows", async () => {
  recipe = await k.exportRecipe(dataset, profile, plan, dictionary, [pin]);
  const value = JSON.parse(recipe);
  assert.equal(value.source.fingerprint.length, 64);
  assert.equal(value.source.rows, 8);
  assert.equal(value.rows, undefined);
  assert.equal(value.dataset, undefined);
  assert.equal(value.pins[0].plan.metric, "销售额");
});
await test("Recipe round trip accepts identical data with a different local ID", async () => {
  const before = JSON.stringify(dataset);
  const imported = await k.importRecipe(
    recipe,
    { ...dataset, id: "other", createdAt: "other" },
    baseProfile,
  );
  assert.deepEqual(imported.dictionary, dictionary);
  assert.equal(imported.pins.length, 1);
  assert.equal(JSON.stringify(dataset), before);
});
await test("Recipe rejects different data even with identical shape", async () => {
  const changed = structuredClone(dataset);
  changed.rows[0].销售额 = "999";
  await assert.rejects(
    k.importRecipe(recipe, changed, baseProfile),
    /另一份数据/,
  );
  const reordered = { ...dataset, rows: [...dataset.rows].reverse() };
  await assert.rejects(
    k.importRecipe(recipe, reordered, baseProfile),
    /另一份数据/,
  );
});
await test("Recipe rejects executable extras, invented fields and oversized input", async () => {
  const unknown = { ...JSON.parse(recipe), script: "alert(1)" };
  await assert.rejects(
    k.importRecipe(JSON.stringify(unknown), dataset, profile),
    /格式/,
  );
  const wrong = JSON.parse(recipe);
  wrong.plan.groupBy = "不存在";
  await assert.rejects(
    k.importRecipe(JSON.stringify(wrong), dataset, profile),
    /维度/,
  );
  await assert.rejects(
    k.importRecipe("x".repeat(100001), dataset, profile),
    /100 KB/,
  );
});
let html;
await test("Offline report recomputes figures and preserves calculation scope", () => {
  html = k.reportHTML(
    dataset,
    profile,
    [
      {
        plan: {
          ...plan,
          filters: [{ field: "地区", operator: "eq", value: "华东" }],
        },
        mode: "demo",
        note: "只看华东",
      },
    ],
    dictionary,
  );
  assert.ok(html.includes("500"));
  assert.ok(html.includes("匹配 4 条 / 有效 4 条"));
  assert.ok(html.includes("人民币元"));
  assert.ok(html.includes("<svg"));
  assert.ok(html.includes("<table>"));
  assert.ok(html.includes("演示规划"));
  writeFileSync(path.join(target, "offline-report.html"), html);
});
await test("Offline report escapes user content and has no network or scripts", () => {
  const malicious = k.reportHTML(
    { ...dataset, name: '<script>alert("x")</script>' },
    profile,
    [
      {
        plan: { ...plan, title: "<img src=x onerror=alert(1)>" },
        note: "<script>hi</script>",
      },
    ],
    dictionary,
  );
  assert.ok(!malicious.includes("<script"));
  assert.ok(!malicious.includes("<img"));
  assert.ok(malicious.includes("&lt;script&gt;"));
  assert.ok(malicious.includes("default-src 'none'"));
  assert.ok(
    !/<(?:script|link|iframe)\b|(?:src|href)\s*=\s*["']https?:/i.test(html),
  );
});
await test("Report catalogue merges duplicate plans while preserving notes and provenance", () => {
  const reordered = Object.fromEntries(Object.entries(plan).reverse());
  const items = reports.collectReportAnalyses(plan, [{ plan: reordered, note: "收藏的业务解释" }], [{ plan, mode: "model" }]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].sources, ["current", "pin", "history"]);
  assert.equal(items[0].note, "收藏的业务解释");
  assert.equal(items[0].mode, "model");
  assert.notEqual(items[0].plan, undefined);
});
await test("Report selections omit exactly the chosen plans and cap at 30", () => {
  const items = reports.collectReportAnalyses(plan, Array.from({ length: 34 }, (_, index) => ({ plan: { ...plan, title: `分析${index}` } })), []);
  assert.equal(reports.selectReportAnalyses(items, []).length, 30);
  const selected = reports.selectReportAnalyses(items, items.slice(0, 7).map(item => item.key));
  assert.equal(selected.length, 28);
  assert.equal(selected[0].plan.title, "分析6");
  assert.equal(reports.selectReportAnalyses(items, items.map(item => item.key)).length, 0);
  assert.throws(() => reports.markdownReport(dataset, profile, [], {}, []), /至少/);
  assert.throws(() => reports.markdownReport(dataset, profile, items, {}, []), /30/);
});
await test("HTML and Markdown share selected figures, notes, dictionary and full-dataset rule counts", () => {
  const filteredPlan = { ...plan, filters: [{ field: "地区", operator: "eq", value: "华东" }] };
  const items = reports.collectReportAnalyses(filteredPlan, [{ plan: filteredPlan, note: "业务解释" }], [{ plan: filteredPlan, mode: "model" }]);
  const rules = [{ id: "required", field: "地区", kind: "required" }];
  const md = reports.markdownReport(dataset, profile, items, dictionary, rules);
  const html = k.reportHTML(dataset, profile, items, dictionary, rules);
  for (const text of [md, html]) for (const expected of ["500", "匹配 4 条 / 有效 4 条", "业务解释", "模型规划", "人民币元", "字段字典", "业务规则检查", "不受"]) assert.ok(text.includes(expected), expected);
  assert.match(md, /\| 地区 \| 必填 \|.*\| 8 \| 8 \| 0 \| 0 \| 100.0% \|/);
  assert.ok(html.includes("完整当前数据集（8 条）"));
  const before = JSON.stringify(dataset);
  const changed = structuredClone(dataset); changed.rows[0].销售额 = "1000";
  assert.notEqual(reports.markdownReport(changed, e.profileDataset(changed), items, dictionary, rules), md);
  assert.equal(JSON.stringify(dataset), before);
});
await test("Report distinguishes unconfigured and all-skipped rules and escapes malicious conditions", () => {
  const data = e.parseCSV('组,金额\nA,\nB,');
  const p = e.profileDataset(data), items = reports.collectReportAnalyses(e.defaultPlan(p), [], []);
  const rules = [{ id: "skip", field: "金额", kind: "allowed", values: ['<img src=x onerror=alert(1)>|`'] }];
  const html = k.reportHTML(data, p, items, {}, rules), md = reports.markdownReport(data, p, items, {}, rules);
  assert.ok(!html.includes("<img")); assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("未检查")); assert.ok(md.includes("未检查"));
  assert.ok(!md.includes("<img")); assert.ok(!html.includes("100.0%"));
  assert.ok(k.reportHTML(data, p, items, {}).includes("未配置业务规则"));
  assert.ok(reports.markdownReport(data, p, items, {}, []).includes("未配置业务规则"));
});
await test("Markdown escapes user markup and protects SQL fences", () => {
  const text = e.reportMarkdown({ ...dataset, name: "<script>x</script>" }, profile, [{ plan: { ...plan, title: "[click](https://example.invalid)" }, note: "<img src=x>", result: { ...e.executePlan(dataset, profile, plan), sql: "SELECT ```\n<script>x</script>" } }]);
  assert.ok(text.includes("&#60;script&#62;")); assert.ok(text.includes("&#91;click&#93;"));
  assert.ok(text.includes("````sql\nSELECT ```\n<script>x</script>\n````"));
  assert.ok(!text.includes("<img src=x>"));
});
console.log(`\n${count} workspace kit checks passed.`);
