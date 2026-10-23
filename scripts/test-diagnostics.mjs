import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/diagnostics-tests");
mkdirSync(out, { recursive: true });
for (const name of [
  "data-engine",
  "diagnostics",
  "import-sheet",
  "explainer",
  "workspace-kit",
]) {
  const code = transpileModule(readFileSync("lib/" + name + ".ts", "utf8"), {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 },
  })
    .outputText.replace(/(["'])\.\/(data-engine|diagnostics)\1/g, '"./$2.mjs"')
    .replace(/from 'zod'/g, 'from "zod"');
  writeFileSync(path.join(out, name + ".mjs"), code);
}
const e = await import(pathToFileURL(path.join(out, "data-engine.mjs"))),
  d = await import(pathToFileURL(path.join(out, "diagnostics.mjs"))),
  i = await import(pathToFileURL(path.join(out, "import-sheet.mjs"))),
  x = await import(pathToFileURL(path.join(out, "explainer.mjs"))),
  k = await import(pathToFileURL(path.join(out, "workspace-kit.mjs")));
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log("PASS " + name);
}
const dataset = e.parseCSV(readFileSync("docs/samples/innovation.csv", "utf8")),
  p = e.profileDataset(dataset),
  input = {
    date: "日期",
    metric: "销售额",
    dimension: "地区",
    current: { start: "2026-02-01", end: "2026-02-28" },
    previous: { start: "2026-01-01", end: "2026-01-31" },
    filters: [],
  };
await test("Period totals and all-group contributions reconcile exactly", () => {
  const r = d.comparePeriods(dataset, p, input);
  assert.equal(r.current, 4450);
  assert.equal(r.previous, 460);
  assert.equal(r.delta, 3990);
  assert.equal(
    r.groups.reduce((s, g) => s + g.delta, 0),
    3990,
  );
  assert.equal(r.groups.find((g) => g.name === "华南").delta, 3910);
  assert.ok(r.warnings.some((w) => w.includes("天数不同")));
});
await test("Global category scope applies to both periods without changing source", () => {
  const before = JSON.stringify(dataset),
    r = d.comparePeriods(dataset, p, {
      ...input,
      filters: [{ field: "地区", operator: "eq", value: "华东" }],
    });
  assert.equal(r.current, 290);
  assert.equal(r.previous, 210);
  assert.equal(r.delta, 80);
  assert.equal(JSON.stringify(dataset), before);
});
await test("Invalid calendar days, reversed ranges and overlapping periods are rejected", () => {
  for (const current of [
    { start: "2026-02-30", end: "2026-03-01" },
    { start: "2026-03-02", end: "2026-03-01" },
    { start: "2026-01-15", end: "2026-02-01" },
  ])
    assert.throws(() => d.comparePeriods(dataset, p, { ...input, current }));
});
await test("Missing metrics and dates are counted, not fabricated as zero observations", () => {
  const a = e.parseCSV("日期,组,金额\n2026-01-01,A,10\n2026-02-01,A,\n,A,90"),
    r = d.comparePeriods(a, e.profileDataset(a), {
      ...input,
      dimension: "组",
      metric: "金额",
    });
  assert.equal(r.currentRows, 0);
  assert.equal(r.excluded, 1);
  assert.equal(r.missingDates, 1);
  assert.ok(r.warnings.length);
});
await test("Zero or negative bases do not produce misleading growth percentages", () => {
  for (const value of [0, -20]) {
    const a = e.parseCSV(
        "日期,组,金额\n2026-01-01,A," + value + "\n2026-02-01,A,10",
      ),
      r = d.comparePeriods(a, e.profileDataset(a), {
        ...input,
        dimension: "组",
        metric: "金额",
      });
    assert.equal(r.growth, null);
  }
});
await test("An active date filter is preserved and its truncation is disclosed", () => {
  const r = d.comparePeriods(dataset, p, {
    ...input,
    filters: [{ field: "日期", operator: "gte", value: "2026-02-01" }],
  });
  assert.equal(r.previousRows, 0);
  assert.ok(r.warnings.some((w) => w.includes("全局日期筛选")));
});
await test("Waterfall remainder conserves every positive and negative contribution", () => {
  const groups = Array.from({ length: 40 }, (_, j) => ({
      name: "组" + j,
      current: j,
      previous: j % 3,
      delta: j - (j % 3),
    })),
    bars = d.collapseWaterfall(groups);
  assert.equal(bars.length, 8);
  assert.equal(
    bars.reduce((s, g) => s + g.delta, 0),
    groups.reduce((s, g) => s + g.delta, 0),
  );
});
await test("Year-over-year leap-day alignment clamps to the previous valid calendar day", () => {
  const a = e.parseCSV("日期,组,金额\n2024-02-29,A,10");
  assert.deepEqual(d.periodDefaults(a, "日期", true), {
    current: { start: "2024-02-01", end: "2024-02-29" },
    previous: { start: "2023-02-01", end: "2023-02-28" },
  });
});
await test("Ambiguous performance questions request a concrete metric", () => {
  const c = d.clarifyQuestion("哪个地区表现最好", p, dataset);
  assert.ok(c.reason.includes("指标"));
  assert.ok(c.choices.some((c) => c.question.includes("销售额合计")));
  assert.equal(d.clarifyQuestion("哪个地区销售额合计最高", p, dataset), null);
});
await test("Relative dates anchor to data, not the computer date", () => {
  const c = d.clarifyQuestion("最近销售额趋势", p, dataset);
  assert.ok(c.reason.includes("2026-02-04"));
  assert.ok(
    c.choices.some((c) => c.question.includes("2026-02-01到2026-02-04")),
  );
  assert.equal(d.clarifyQuestion(c.choices[0].question, p, dataset), null);
});
await test("Ratios use sums on paired complete rows, not an average of row ratios", () => {
  const a = e.parseCSV("利润,销售额\n10,100\n90,300\n,50");
  const r = d.ratioMetric(a, "利润", "销售额");
  assert.equal(r.value, 0.25);
  assert.equal(r.excluded, 1);
  assert.equal(r.valid, 2);
});
await test("Distinct-order metrics deduplicate identifiers and reject absent fields", () => {
  const a = e.parseCSV("金额,订单\n100,O1\n50,O1\n150,O2");
  assert.equal(d.ratioMetric(a, "金额", "订单", "distinct").value, 150);
  assert.throws(() => d.ratioMetric(a, "金额", "不存在", "distinct"));
  assert.equal(d.ratioMetric(e.parseCSV("A,B\n10,0"), "A", "B").value, null);
});
const sheet = {
  sheet: "经营",
  data: [
    ["说明"],
    ["日期", "编码", "销售额", "比例"],
    [new Date("2026-02-01T00:00:00Z"), "001", 100, "25%"],
    [null, null, null, null],
    ["2026-02-02", "002", 200, "50%"],
  ],
};
await test("Import preview skips a title row and blanks, preserving dates and text identifiers", () => {
  const a = i.importSheet(sheet, "test.xlsx", {
    header: 1,
    types: { 编码: "text", 销售额: "number", 比例: "number" },
  });
  assert.equal(a.rows.length, 2);
  assert.equal(a.rows[0].日期, "2026-02-01");
  assert.equal(a.rows[0].编码, "001");
  assert.equal(a.rows[0].比例, 0.25);
  assert.equal(
    e.profileDataset(a).fields.find((f) => f.name === "编码").type,
    "text",
  );
});
await test("Import rejects duplicate headers, missing headers and trailing unlabeled cells", () => {
  for (const data of [
    [
      ["A", "A"],
      [1, 2],
    ],
    [
      ["A", ""],
      [1, 2],
    ],
    [["A"], [1, 2]],
  ])
    assert.throws(() =>
      i.importSheet({ sheet: "bad", data }, "bad.xlsx", {
        header: 0,
        types: {},
      }),
    );
});
await test("Type correction rejects an invalid number instead of silently discarding it", () => {
  assert.throws(() =>
    i.importSheet({ sheet: "bad", data: [["金额"], ["不详"]] }, "bad.xlsx", {
      header: 0,
      types: { 金额: "number" },
    }),
  );
});
await test("Type overrides are bound into recipe fingerprints", async () => {
  const a = i.importSheet(
    {
      sheet: "x",
      data: [
        ["编码", "金额"],
        ["001", 1],
      ],
    },
    "a",
    { header: 0, types: { 编码: "text" } },
  );
  assert.notEqual(
    await k.datasetFingerprint(a),
    await k.datasetFingerprint({ ...a, types: { 编码: "number" } }),
  );
});
await test("Evidence guide rejects invented references, duplicates and arbitrary prose", () => {
  const facts = [
    { id: "total", title: "合计", value: 10, unit: "元", detail: "合计" },
  ];
  assert.deepEqual(
    x.validateGuide({ focus: ["total"], checks: ["source"] }, facts).focus,
    ["total"],
  );
  for (const v of [
    { focus: ["fake"], checks: [] },
    { focus: ["total", "total"], checks: [] },
    { focus: ["total"], checks: [], text: "销量翻倍" },
  ])
    assert.throws(() => x.validateGuide(v, facts));
});
await test("Real-model guide tool selects facts with provider-specific compatibility and records usage", async () => {
  const facts = [
    { id: "total", title: "合计", value: 10, unit: "元", detail: "合计" },
  ];
  let sent;
  const result = await x.explainFacts(
    facts,
    { key: "test-only", url: "https://api.deepseek.com" },
    async (_url, options) => {
      sent = JSON.parse(options.body);
      return Response.json({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: "select_evidence",
                    arguments: JSON.stringify({
                      focus: ["total"],
                      checks: ["source"],
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      });
    },
  );
  assert.equal(result.mode, "model");
  assert.equal(result.usage.input, 100);
  assert.equal(sent.thinking.type, "disabled");
  assert.ok(!JSON.stringify(sent).includes("test-only"));
});
await test("Unsafe explanation endpoints are rejected before transmitting credentials", async () => {
  for (const url of [
    "https://user:pass@example.com",
    "http://remote.example",
    "https://example.com?key=1",
  ])
    await assert.rejects(() =>
      x.explainFacts(
        [{ id: "a", title: "x", value: 1, unit: "", detail: "x" }],
        { key: "test", url },
        async () => {
          throw new Error("must not send");
        },
      ),
    );
});
await test("False-valued missing filters cannot invert or silently narrow the scope", () => {
  assert.throws(() =>
    e.validateFilters(
      [{ field: "地区", operator: "missing", value: "false" }],
      p.fields,
    ),
  );
});
await test("Import type correction rejects rolled-over calendar dates", () => {
  assert.throws(() =>
    i.importSheet(
      { sheet: "bad", data: [["日期"], ["2026-02-30"]] },
      "bad.xlsx",
      { header: 0, types: { 日期: "date" } },
    ),
  );
});
await test('Workbook ZIP envelope rejects excessive expansion before parsing XML',()=>{
 const bytes=readFileSync('docs/samples/period-comparison.xlsx');const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);assert.doesNotThrow(()=>i.checkWorkbookArchive(raw));
 const bad=raw.slice(0),view=new DataView(bad);for(let offset=0;offset+46<view.byteLength;offset++){if(view.getUint32(offset,true)===0x02014b50){view.setUint32(offset+24,70*1024*1024,true);break;}}
 assert.throws(()=>i.checkWorkbookArchive(bad));assert.throws(()=>i.checkWorkbookArchive(new ArrayBuffer(10)));
});
console.log("\n" + count + " meaningful diagnostic checks passed.");
