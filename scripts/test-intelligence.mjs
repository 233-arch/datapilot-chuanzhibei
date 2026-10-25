import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/intelligence-tests");
mkdirSync(out, { recursive: true });
for (const name of [
  "data-engine",
  "diagnostics",
  "workbench",
  "knowledge",
  "workspace-tools",
  "model-tool",
  "agent",
  "workflow-model",
  "knowledge-model",
  "assistant-guard",
  "workflow-run",
  "explainer",
]) {
  const code = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 },
  }).outputText.replace(/(["'])\.\/([a-z-]+)\1/g, '"./$2.mjs"');
  writeFileSync(path.join(out, name + ".mjs"), code);
}
const use = (n) => import(pathToFileURL(path.join(out, n + ".mjs")));
const [e, d, w, k, t, m, wm, km, g, r] = await Promise.all(
  [
    "data-engine",
    "diagnostics",
    "workbench",
    "knowledge",
    "workspace-tools",
    "model-tool",
    "workflow-model",
    "knowledge-model",
    "assistant-guard",
    "workflow-run",
  ].map(use),
);
const dataset = e.parseCSV(readFileSync("docs/samples/innovation.csv", "utf8")),
  profile = e.profileDataset(dataset);
const plan = {
  title: "两期销售额",
  date: "日期",
  metric: "销售额",
  dimensions: ["地区", "产品类别"],
  current: { start: "2026-02-01", end: "2026-02-28" },
  previous: { start: "2026-01-01", end: "2026-01-31" },
  knowledgeIds: [],
};
const saved = {
  id: "margin",
  name: "利润率",
  numerator: "利润",
  denominator: "销售额",
  kind: "ratio",
  percent: true,
  unit: "",
  description: "完整记录合计比率",
};
const docs = [
  {
    id: "margin",
    title: "利润率定义",
    text: "总体利润率使用利润合计除以销售额合计，不平均每行比率。缺失记录成对排除，分母零时不计算。",
    version: "1",
    source: "试验定义",
  },
  {
    id: "order",
    title: "客单价定义",
    text: "客单价使用销售额合计除以订单编号的去重数量，同一订单金额按行合计而编号只计一次。",
    version: "1",
    source: "试验定义",
  },
  {
    id: "refund",
    title: "退款业务规则",
    text: "收入应扣除退款金额，已经成功退款的订单不计入订单数量。退款以实际入账日为准。",
    version: "1",
    source: "试验定义",
  },
];
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log("PASS " + name);
}
await test("Diagnostic persistence preserves custom periods and ratio fields", () => {
  const state = {
    ...w.defaultDiagnostic(dataset, profile),
    current: plan.current,
    previous: plan.previous,
    numerator: "利润",
    denominator: "销售额",
    percent: false,
  };
  assert.deepEqual(
    w.restoreDiagnostic(JSON.parse(JSON.stringify(state)), dataset, profile),
    state,
  );
});
await test("Dataset changes cannot restore another workspace's metrics or knowledge", () => {
  const old = {
    ...t.defaultTools(dataset, profile),
    metrics: [saved],
    documents: docs,
  };
  const next = { ...dataset, id: "different" };
  assert.deepEqual(
    t.restoreTools(old, next, profile),
    t.defaultTools(next, profile),
  );
});
await test("Legacy workspaces receive valid defaults without inventing user documents", () => {
  const state = t.restoreTools(undefined, dataset, profile);
  assert.equal(state.documents.length, 0);
  assert.equal(state.metrics.length, 0);
  assert.equal(state.diagnostic.date, "日期");
});
await test("Invalid persisted knowledge does not discard valid saved metric definitions", () => {
  const state = t.restoreTools(
    {
      ...t.defaultTools(dataset, profile),
      metrics: [saved],
      documents: [{ execute: "x" }],
    },
    dataset,
    profile,
  );
  assert.deepEqual(state.metrics, [saved]);
  assert.deepEqual(state.documents, []);
});
await test("Metric formulas reject invented and nonnumeric numerator fields", () => {
  for (const numerator of ["不存在", "地区"])
    assert.throws(() => w.validateMetric({ ...saved, numerator }, profile));
  assert.throws(() =>
    w.validateMetric({ ...saved, denominator: "地区" }, profile),
  );
});
await test("Metric names and workspace metric counts are bounded", () => {
  assert.throws(() =>
    w.saveMetric([saved], { ...saved, id: "other" }, profile),
  );
  const full = Array.from({ length: 12 }, (_, i) => ({
    ...saved,
    id: String(i),
    name: "指标" + i,
  }));
  assert.throws(() =>
    w.saveMetric(full, { ...saved, id: "extra", name: "extra" }, profile),
  );
});
await test("Saved formulas recompute on actual scope with paired missing-row semantics", () => {
  assert.equal(w.metricValue(dataset, saved).value, 0.1);
  const scope = e.filterDataset(
    dataset,
    [{ field: "地区", operator: "eq", value: "华东" }],
    profile,
  );
  assert.equal(w.metricValue(scope, saved).numerator, 50);
  assert.equal(w.metricValue(scope, saved).denominator, 500);
});
await test("Workflow plans reject invented fields, numeric dimensions and duplicate dimensions", () => {
  for (const patch of [
    { metric: "未知" },
    { dimensions: ["销售额"] },
    { dimensions: ["地区", "地区"] },
    { dimensions: [] },
  ])
    assert.throws(() => w.validateWorkflowPlan({ ...plan, ...patch }, profile));
});
await test("Workflow plans reject impossible days, reversed periods and overlap", () => {
  for (const current of [
    { start: "2026-02-30", end: "2026-03-01" },
    { start: "2026-03-01", end: "2026-02-01" },
    { start: "2026-01-02", end: "2026-02-28" },
  ])
    assert.throws(() => w.validateWorkflowPlan({ ...plan, current }, profile));
});
await test("Workflow citations and tool permissions cannot be invented", () => {
  assert.throws(() =>
    w.validateWorkflowPlan({ ...plan, knowledgeIds: ["fake"] }, profile, [
      "valid",
    ]),
  );
  assert.throws(() =>
    w.validateWorkflowPlan({ ...plan, execute: "delete" }, profile),
  );
});
await test("Restored workflow keeps a valid plan and refuses corrupt field references", () => {
  assert.deepEqual(w.restoreWorkflow({ question: "对比", plan }, profile), {
    question: "对比",
    plan,
  });
  assert.equal(
    w.restoreWorkflow(
      { question: "对比", plan: { ...plan, date: "unknown" } },
      profile,
    ).plan,
    null,
  );
});
await test("Document splitting bounds chunks and gives reproducible document references", () => {
  const long = { ...docs[0], text: "利润定义。".repeat(1000) };
  const snippets = k.splitDocuments([long]);
  assert.ok(snippets.length > 1);
  assert.ok(snippets.every((s) => s.text.length <= 900));
  assert.equal(new Set(snippets.map((s) => s.id)).size, snippets.length);
  assert.deepEqual(k.splitDocuments([long]), snippets);
});
await test("Sparse vector retrieval ranks the relevant definition first", () => {
  for (const [q, id] of [
    ["利润率如何计算", "margin"],
    ["客单价和订单去重", "order"],
    ["退款订单如何处理", "refund"],
  ])
    assert.equal(k.retrieveKnowledge(q, docs)[0]?.documentId, id);
});
await test("No-overlap questions return no context instead of an invented source", () => {
  assert.deepEqual(k.retrieveKnowledge("火星赤道直径多少公里", docs), []);
  assert.deepEqual(k.retrieveKnowledge("利润率", []), []);
});
await test("Knowledge documents reject oversized text, repeated IDs and executable extras", () => {
  assert.throws(() => k.validateDocuments([docs[0], docs[0]]));
  assert.throws(() =>
    k.validateDocuments([{ ...docs[0], text: "a".repeat(24001) }]),
  );
  assert.throws(() => k.validateDocuments([{ ...docs[0], script: "x" }]));
});
await test("Answer citations match exact text and unique source references", () => {
  const snippets = k.splitDocuments(docs),
    c = { id: snippets[0].id, quote: "利润合计除以销售额合计" };
  assert.equal(
    k.validateKnowledgeAnswer(
      { status: "answered", answer: "按合计比率计算。", citations: [c] },
      snippets,
    ).status,
    "answered",
  );
  const quotes = k.sourceQuotes(snippets[0]);
  assert.ok(quotes.length >= 2);
  assert.equal(
    k.validateKnowledgeAnswer(
      {
        status: "answered",
        answer: "test",
        citations: quotes
          .slice(0, 2)
          .map((quote, quoteIndex) => ({
            id: snippets[0].id,
            quote,
            quoteIndex,
          })),
      },
      snippets,
    ).citations.length,
    2,
  );
  for (const citations of [
    [],
    [{ ...c, id: "fake" }],
    [{ ...c, quote: "利润率永远等于百分之十" }],
    [c, c],
  ])
    assert.throws(() =>
      k.validateKnowledgeAnswer(
        { status: "answered", answer: "test", citations },
        snippets,
      ),
    );
});
await test("Conflicting definitions require two sources and cannot silently pick a version", () => {
  const snippets = k.splitDocuments(docs),
    a = {
      status: "conflict",
      answer: "两种定义不一致，需要确认适用版本。",
      citations: [{ id: snippets[0].id, quote: "利润合计除以销售额合计" }],
    };
  assert.throws(() => k.validateKnowledgeAnswer(a, snippets));
});
await test("Source drill-through preserves filters and both period boundaries", () => {
  const source = r.workflowSource(
    dataset,
    profile,
    [{ field: "地区", operator: "eq", value: "华东" }],
    plan,
    "产品类别",
    "current",
    "配件",
  );
  assert.equal(source.rows.length, 1);
  assert.equal(source.rows[0].销售额, "140");
  assert.equal(dataset.rows.length, 8);
});
await test("Multi-dimension facts use distinct references and each reconciles to the same total", () => {
  const comparisons = plan.dimensions.map((dimension) => ({
    dimension,
    result: d.comparePeriods(dataset, profile, {
      ...plan,
      dimension,
      filters: [],
    }),
  }));
  for (const c of comparisons)
    assert.equal(
      c.result.groups.reduce((n, g) => n + g.delta, 0),
      3990,
    );
  const facts = r.workflowFacts(comparisons);
  assert.equal(new Set(facts.map((f) => f.id)).size, facts.length);
  assert.ok(facts.length <= 20);
  const report = r.workflowMarkdown(
    plan,
    [],
    profile,
    comparisons,
    null,
    [],
    [saved],
    dataset,
  );
  assert.ok(report.includes("3990"));
  assert.ok(report.includes("不同维度的分解不能相加"));
  assert.ok(report.includes("利润率"));
});
await test("Workflow scope fingerprints change with filters, periods and field definitions", () => {
  const key = w.workflowScopeKey(dataset.id, profile, [], plan);
  assert.notEqual(
    key,
    w.workflowScopeKey(
      dataset.id,
      profile,
      [{ field: "地区", operator: "eq", value: "华东" }],
      plan,
    ),
  );
  assert.notEqual(
    key,
    w.workflowScopeKey(
      dataset.id,
      {
        ...profile,
        fields: profile.fields.map((f) => ({ ...f, description: "new" })),
      },
      [],
      plan,
    ),
  );
});
const config = {
  key: "synthetic-not-a-key",
  url: "https://api.deepseek.com",
  model: "deepseek-flash",
};
function toolResponse(name, value) {
  return Response.json({
    choices: [
      {
        message: {
          tool_calls: [
            { function: { name, arguments: JSON.stringify(value) } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 33, completion_tokens: 22 },
  });
}
await test("Workflow model receives scoped context, forces a validated tool and records actual usage", async () => {
  const input = {
    question: "比较两期销售额，按地区和产品类别拆解",
    profile,
    filters: [],
    contexts: [
      { date: plan.date, current: plan.current, previous: plan.previous },
    ],
    snippets: [],
  };
  let body;
  const result = await wm.createWorkflow(
    input,
    config,
    undefined,
    async (url, init) => {
      body = JSON.parse(init.body);
      return toolResponse("create_diagnostic_workflow", plan);
    },
  );
  assert.equal(result.mode, "model");
  assert.deepEqual(result.plan, plan);
  assert.equal(body.thinking.type, "disabled");
  assert.equal(body.tool_choice.function.name, "create_diagnostic_workflow");
  assert.equal(result.usage.input, 33);
});
await test("Unsupported ratios and forecasting are refused before a model request", async () => {
  for (const question of [
    "预测明年销售额",
    "比较两期利润率",
    "客单价为什么下降",
  ]) {
    let called = false;
    await assert.rejects(
      wm.createWorkflow(
        { question, profile, filters: [], contexts: [], snippets: [] },
        config,
        undefined,
        async () => {
          called = true;
        },
      ),
    );
    assert.equal(called, false);
  }
});
await test("Knowledge generation is grounded in retrieved snippets with verbatim citations", async () => {
  const snippets = k.splitDocuments(docs).slice(0, 1);
  let body;
  const result = await km.answerKnowledge(
    { question: "利润率如何计算", snippets },
    config,
    undefined,
    async (url, init) => {
      body = JSON.parse(init.body);
      return toolResponse("answer_with_sources", {
        status: "answered",
        answer: "使用合计比率，排除不完整记录。",
        citations: [{ id: snippets[0].id, quoteIndex: 0 }],
      });
    },
  );
  assert.equal(result.mode, "model");
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].quote, k.sourceQuotes(snippets[0])[0]);
  assert.ok(
    k
      .sourceQuotes(snippets[0])
      .every((q) => q.length <= 300 && snippets[0].text.includes(q)),
  );
  await assert.rejects(
    km.answerKnowledge(
      { question: "利润率如何计算", snippets },
      config,
      undefined,
      async () =>
        toolResponse("answer_with_sources", {
          status: "answered",
          answer: "test",
          citations: [{ id: snippets[0].id, quoteIndex: 999 }],
        }),
    ),
  );
  assert.equal(body.tool_choice.function.name, "answer_with_sources");
  assert.ok(body.messages[1].content.includes(snippets[0].text));
});
await test("Unsafe model endpoints fail before credentials are transmitted", async () => {
  for (const url of [
    "http://evil.example",
    "https://user:pass@api.deepseek.com",
    "file:///tmp/x",
    "https://api.deepseek.com?leak=true",
  ]) {
    let called = false;
    await assert.rejects(
      m.modelTool(
        { ...config, url },
        "x",
        "x",
        {},
        "x",
        {},
        undefined,
        async () => {
          called = true;
        },
      ),
    );
    assert.equal(called, false);
  }
});
await test("Cancellation reaches model transport and wrong tool calls cannot pass", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    m.modelTool(
      config,
      "expected",
      "x",
      {},
      "x",
      {},
      controller.signal,
      async (url, init) => {
        assert.equal(init.signal.aborted, true);
        throw new DOMException("cancel", "AbortError");
      },
    ),
  );
  await assert.rejects(
    m.modelTool(config, "expected", "x", {}, "x", {}, undefined, async () =>
      toolResponse("wrong", {}),
    ),
  );
});
await test("Per-isolate gate bounds concurrent requests and releases exactly once", () => {
  const gate = g.createAssistantGate(() => 1000),
    request = new Request("https://site.example/api/workflow");
  const a = gate(request),
    b = gate(request);
  assert.equal(gate(request).response.status, 429);
  a.release();
  a.release();
  const c = gate(request);
  assert.equal(c.response, undefined);
  assert.equal(gate(request).response.status, 429);
  b.release();
  c.release();
});
await test("Rate bounds expire and cross-origin model requests are rejected", () => {
  let now = 1000;
  const gate = g.createAssistantGate(() => now),
    request = new Request("https://site.example/api/workflow");
  for (let i = 0; i < 12; i++) gate(request).release();
  assert.equal(gate(request).response.status, 429);
  now += 60001;
  gate(request).release();
  assert.equal(
    gate(
      new Request("https://site.example/api/workflow", {
        headers: { Origin: "https://other.example" },
      }),
    ).response.status,
    403,
  );
});
console.log(`\n${count} meaningful intelligence checks passed.`);
