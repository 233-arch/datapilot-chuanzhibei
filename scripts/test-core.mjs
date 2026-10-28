import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const target = path.resolve("work/tests");
mkdirSync(target, { recursive: true });
for (const name of ["data-engine", "agent"]) {
  let source = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 },
  }).outputText;
  source = source.replace(/(["'])\.\/data-engine\1/g, '"./data-engine.mjs"');
  writeFileSync(path.join(target, `${name}.mjs`), source);
}
const e = await import(
  pathToFileURL(path.join(target, "data-engine.mjs")).href
);
const a = await import(pathToFileURL(path.join(target, "agent.mjs")).href);
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
const fixture = e.parseCSV(
  "日期,地区,销售额,利润\r\n2026-01-01,华东,100,10\r\n2026-01-02,华东,200,20\r\n2026-02-01,华南,300,30\r\n2026-02-02,华南,,40\r\n2026-02-02,华南,,40",
  "验证.csv",
);
const profile = e.profileDataset(fixture);
await test("CSV handles BOM, quoted commas, escaped quotes and multiline fields", () => {
  const d = e.parseCSV(
    '\uFEFF姓名,备注,金额\r\n张三,"一,二",100\r\n李四,"第一行\n第二行""引号",200',
  );
  assert.equal(d.rows.length, 2);
  assert.equal(d.rows[0].备注, "一,二");
  assert.equal(d.rows[1].备注, '第一行\n第二行"引号');
});
await test("TSV and semicolon input", () => {
  assert.deepEqual(e.parseCSV("a\tb\n1\t2").columns, ["a", "b"]);
  assert.equal(e.parseCSV("a;b\n1;2").rows[0].b, "2");
});
await test("Malformed CSV and duplicate headers are rejected", () => {
  for (const csv of [
    "a,b\n1",
    "a,a\n1,2",
    'a,b\n"1,2',
    "__proto__,a\n1,2",
    "a,b",
  ])
    assert.throws(() => e.parseCSV(csv));
});
await test("File, column and row limits are enforced", () => {
  assert.throws(() => e.parseCSV("a\n" + "x".repeat(e.LIMITS.bytes + 1)));
  assert.throws(() =>
    e.parseCSV(
      Array.from({ length: 81 }, (_, i) => `c${i}`).join(",") +
        "\n" +
        Array(81).fill("1").join(","),
    ),
  );
  assert.throws(() => e.parseCSV("a\n" + Array(20001).fill("1").join("\n")));
});
await test("Files above the previous 5 MB cap retain all rows and exact totals", () => {
  const csv = "地区,金额,备注\n" + Array.from({ length: 6000 }, (_, i) =>
    `${i % 2 ? "华南" : "华东"},${i + 1},${"录屏合成数据".repeat(60)}`,
  ).join("\n");
  assert.ok(Buffer.byteLength(csv) > 5 * 1024 * 1024);
  const data = e.parseCSV(csv), profile = e.profileDataset(data);
  assert.equal(data.rows.length, 6000);
  assert.equal(data.rows[5999].备注.length, "录屏合成数据".length * 60);
  const result = e.executePlan(data, profile, {
    ...e.defaultPlan(profile), groupBy: "地区", metric: "金额", aggregate: "sum",
  });
  assert.equal(result.validRows, 6000);
  assert.equal(result.points.reduce((sum, point) => sum + point.value, 0), 18003000);
});
await test("25 MB boundary is inclusive and oversize rejection reports the active limit", () => {
  assert.doesNotThrow(() => e.validateImportFileSize(25 * 1024 * 1024));
  assert.throws(() => e.validateImportFileSize(25 * 1024 * 1024 + 1), /25 MB/);
  assert.throws(() => e.parseCSV("备注\n" + "数".repeat(Math.ceil(e.LIMITS.bytes / 3))), /25 MB/);
});
await test("Empty values remain null and are not zero", () => {
  assert.equal(fixture.rows[3].销售额, null);
  assert.equal(e.numeric(null), null);
  assert.equal(e.numeric(""), null);
  assert.equal(e.numeric("0"), 0);
  assert.equal(e.numeric("1,234.50"), 1234.5);
  assert.equal(e.numeric("NaN"), null);
});
await test("Profile measures missing, duplicate and numeric types", () => {
  assert.equal(profile.missing, 2);
  assert.equal(profile.duplicates, 1);
  assert.equal(profile.fields.find((f) => f.name === "销售额").type, "number");
  assert.equal(profile.fields[0].type, "date");
  assert.equal(profile.completeness, 90);
});
const plan = {
  title: "区域销售",
  chart: "bar",
  groupBy: "地区",
  metric: "销售额",
  aggregate: "sum",
  timeGrain: "month",
  sort: "desc",
  limit: 10,
};
await test("Sum excludes missing metrics and keeps source duplicates", () => {
  const r = e.executePlan(fixture, profile, plan);
  assert.equal(r.matchedRows, 5);
  assert.equal(r.validRows, 3);
  assert.equal(r.excluded, 2);
  assert.equal(r.points.find((p) => p.name === "华东").value, 300);
  assert.equal(r.points.find((p) => p.name === "华南").value, 300);
});
await test("Mean, count, min and max are deterministic", () => {
  assert.equal(
    e
      .executePlan(fixture, profile, { ...plan, aggregate: "mean" })
      .points.find((p) => p.name === "华东").value,
    150,
  );
  assert.equal(
    e
      .executePlan(fixture, profile, { ...plan, aggregate: "count" })
      .points.find((p) => p.name === "华南").value,
    3,
  );
  assert.equal(
    e
      .executePlan(fixture, profile, { ...plan, aggregate: "min" })
      .points.find((p) => p.name === "华东").value,
    100,
  );
  assert.equal(
    e
      .executePlan(fixture, profile, { ...plan, aggregate: "max" })
      .points.find((p) => p.name === "华东").value,
    200,
  );
});
await test("Date bucketing and natural order", () => {
  const r = e.executePlan(fixture, profile, {
    ...plan,
    groupBy: "日期",
    sort: "natural",
  });
  assert.deepEqual(
    r.points.map((p) => p.name),
    ["2026-01", "2026-02"],
  );
  assert.deepEqual(
    r.points.map((p) => p.value),
    [300, 300],
  );
});
await test("Whitelist filters support categorical and numeric conditions", () => {
  assert.equal(
    e.executePlan(fixture, profile, {
      ...plan,
      filter: { field: "地区", operator: "eq", value: "华东" },
    }).matchedRows,
    2,
  );
  assert.equal(
    e.executePlan(fixture, profile, {
      ...plan,
      filter: { field: "销售额", operator: "gte", value: "200" },
    }).matchedRows,
    2,
  );
  assert.equal(
    e.executePlan(fixture, profile, {
      ...plan,
      filter: { field: "地区", operator: "contains", value: "北" },
    }).points.length,
    0,
  );
});
await test("Invented fields, nonnumeric metrics and unsafe plans are rejected", () => {
  assert.throws(() =>
    e.executePlan(fixture, profile, { ...plan, metric: "利润; DROP TABLE x" }),
  );
  assert.throws(() =>
    e.executePlan(fixture, profile, { ...plan, metric: "地区" }),
  );
  assert.throws(() => e.executePlan(fixture, profile, { ...plan, limit: 999 }));
  assert.throws(() =>
    e.executePlan(fixture, profile, {
      ...plan,
      filter: { field: "秘密", operator: "eq", value: "x" },
    }),
  );
});
await test("Cleaning is nonmutating and does not invent numeric zeroes", () => {
  const clean = e.cleanDataset(fixture, {
    deduplicate: true,
    trim: true,
    fillMissing: false,
  });
  assert.equal(clean.rows.length, 4);
  assert.equal(fixture.rows.length, 5);
  assert.equal(clean.rows[3].销售额, null);
  assert.equal(e.profileDataset(clean).duplicates, 0);
});
await test("CSV export protects spreadsheet formulas", () => {
  const d = e.parseCSV("文本,金额\n=HYPERLINK(),1\n@SUM,2");
  const csv = e.toCSV(d);
  assert.ok(csv.includes("'=HYPERLINK()"));
  assert.ok(csv.includes("'@SUM"));
});
await test("Report includes provenance, results and calculation assumptions", () => {
  const md = e.reportMarkdown(fixture, profile, [
    { plan, result: e.executePlan(fixture, profile, plan) },
  ]);
  assert.ok(md.includes("用户上传数据"));
  assert.ok(md.includes("300.00"));
  assert.ok(md.includes("缺失和非法数值"));
  assert.ok(md.includes("SELECT"));
});
await test("Demo engine is explicitly labeled and maps trend/mean/share", async () => {
  const output = await a.createPlan("按月查看销售额趋势", profile, {});
  assert.equal(output.mode, "demo");
  assert.equal(output.plan.groupBy, "日期");
  assert.equal(output.plan.chart, "line");
  assert.equal(e.demoPlan("地区平均销售额", profile).aggregate, "mean");
  assert.equal(e.demoPlan("地区销售额占比", profile).chart, "pie");
});
await test("Model adapter uses actual function calling without full rows", async () => {
  let captured;
  const mock = async (url, init) => {
    captured = JSON.parse(init.body);
    return Response.json({
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
    });
  };
  const output = await a.createPlan(
    "各地区销售额",
    profile,
    { key: "test-key" },
    mock,
  );
  assert.equal(output.mode, "model");
  assert.equal(captured.tool_choice.function.name, "create_analysis_plan");
  assert.equal(captured.tools[0].function.name, "create_analysis_plan");
  assert.ok(!JSON.stringify(captured).includes("2026-01-02"));
});
await test("Invalid model plans and provider authentication failures are visible", async () => {
  await assert.rejects(() =>
    a.createPlan("x", profile, { key: "test" }, async () =>
      Response.json({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: "create_analysis_plan",
                    arguments: JSON.stringify({ ...plan, metric: "不存在" }),
                  },
                },
              ],
            },
          },
        ],
      }),
    ),
  );
  await assert.rejects(
    () =>
      a.createPlan(
        "x",
        profile,
        { key: "test" },
        async () => new Response("", { status: 401 }),
      ),
    /认证失败/,
  );
});
await test("Synthetic sample is reproducible and has real detectable issues", () => {
  const d = e.makeDemo();
  assert.deepEqual(d.rows, e.makeDemo().rows);
  assert.equal(d.rows.length, 1251);
  assert.equal(e.profileDataset(d).duplicates, 3);
  assert.equal(e.profileDataset(d).missing, 6);
});
await test("Slash dates retain local calendar month instead of shifting timezone", () => {
  const d = e.parseCSV("日期,金额\n2026/02/01,20\n2026/03/01,30");
  const p = e.profileDataset(d);
  assert.deepEqual(
    e
      .executePlan(d, p, {
        ...plan,
        groupBy: "日期",
        metric: "金额",
        sort: "natural",
      })
      .points.map((x) => x.name),
    ["2026-02", "2026-03"],
  );
});
await test("Lowest-N charts do not mislabel the subset maximum as global maximum", () => {
  const d = e.parseCSV("地区,销售额\n甲,10\n乙,20\n丙,30");
  const r = e.executePlan(d, e.profileDataset(d), {
    ...plan,
    sort: "asc",
    limit: 1,
  });
  assert.equal(r.points[0].name, "甲");
  assert.ok(r.summary.includes("丙"));
});
await test("Negative numeric values survive safe CSV round trips", () => {
  const d = e.parseCSV("地区,金额\n甲,-123\n乙,+12");
  assert.equal(e.numeric(e.parseCSV(e.toCSV(d)).rows[0].金额), -123);
});
await test("Unsupported offline prediction requests return an honest error", async () => {
  await assert.rejects(
    () => a.createPlan("预测下个月销售额", profile, {}),
    /演示模式支持/,
  );
});
console.log(`\n${passed} meaningful core checks passed.`);
