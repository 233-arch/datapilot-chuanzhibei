import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import path from "node:path";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const config = {
  key: process.env.DATA_MODEL_API_KEY?.trim(),
  url: process.env.DATA_MODEL_URL,
  model: process.env.DATA_MODEL_NAME,
};
if (!config.key) {
  console.error("真实模型未配置，未执行评测。");
  process.exit(2);
}
const names = [
  "data-engine",
  "diagnostics",
  "workbench",
  "knowledge",
  "model-tool",
  "agent",
  "workflow-model",
  "knowledge-model",
];
const out = path.resolve("work/intelligence-eval");
mkdirSync(out, { recursive: true });
mkdirSync("outputs", { recursive: true });
const hash = createHash("sha256");
for (const name of names) {
  const source = readFileSync("lib/" + name + ".ts");
  hash.update(source);
  writeFileSync(
    path.join(out, name + ".mjs"),
    transpileModule(source.toString(), {
      compilerOptions: {
        target: ScriptTarget.ES2022,
        module: ModuleKind.ES2022,
      },
    }).outputText.replace(/(["'])\.\/([a-z-]+)\1/g, '"./$2.mjs"'),
  );
}
hash.update(readFileSync("scripts/eval-intelligence.mjs"));
const use = (name) => import(pathToFileURL(path.join(out, name + ".mjs")));
const [e, k, wm, km, d] = await Promise.all(
  [
    "data-engine",
    "knowledge",
    "workflow-model",
    "knowledge-model",
    "diagnostics",
  ].map(use),
);
const dataset = e.parseCSV(readFileSync("docs/samples/innovation.csv", "utf8")),
  profile = e.profileDataset(dataset);
const current = { start: "2026-02-01", end: "2026-02-28" },
  previous = { start: "2026-01-01", end: "2026-01-31" };
const definitions = [
  {
    id: "income-v1",
    title: "收入统计规则",
    version: "1",
    source: "评测用合成业务定义",
    text: "本评测中的净收入必须扣除已成功退款的金额。利润字段记录每笔订单的利润金额，可以按地区分组求和比较，不是利润率字段。利润率采用利润合计除以销售额合计的总体比率，不采用逐行利润率的平均值。",
  },
  {
    id: "order-v1",
    title: "订单与客单价规则",
    version: "1",
    source: "评测用合成业务定义",
    text: "客单价等于有效订单的销售额合计除以订单编号去重数量。同一订单的多行金额相加，订单标识只计一次。",
  },
];
const cases = [];
async function run(label, fn) {
  try {
    const actual = await fn();
    cases.push({ label, passed: true, ...actual });
    console.log("PASS " + label);
  } catch (error) {
    cases.push({ label, passed: false, error: error.message });
    console.log("FAIL " + label + ": " + error.message);
  }
}
for (const c of [
  {
    label: "明确周期与两维销售额",
    question:
      "对比2026年2月1日至2月28日和1月1日至1月31日的销售额合计，按地区和产品类别拆解变化",
    metric: "销售额",
    dimensions: ["地区", "产品类别"],
    filters: [],
    delta: 3990,
  },
  {
    label: "利润变化与渠道分解",
    question: "比较2026年2月和2026年1月的利润合计，按地区和渠道拆解",
    metric: "利润",
    dimensions: ["地区", "渠道"],
    filters: [],
    delta: 399,
  },
  {
    label: "保留华东全局范围",
    question:
      "比较2026年2月和2026年1月的销售额合计，按产品类别拆解，保留当前筛选",
    metric: "销售额",
    dimensions: ["产品类别"],
    filters: [{ field: "地区", operator: "eq", value: "华东" }],
    delta: 80,
  },
  {
    label: "检索定义辅助计划",
    question:
      "根据业务文档中的利润字段，比较2026年2月与1月的利润合计，按地区拆解，并引用相关定义",
    metric: "利润",
    dimensions: ["地区"],
    filters: [],
    delta: 399,
    knowledge: true,
  },
]) {
  await run(c.label, async () => {
    const snippets = c.knowledge
      ? k
          .retrieveKnowledge("利润合计", definitions)
          .map(({ score, coverage, ...s }) => s)
      : [];
    const answer = await wm.createWorkflow(
      {
        question: c.question,
        profile,
        filters: c.filters,
        contexts: [{ date: "日期", current, previous }],
        snippets,
      },
      config,
    );
    const plan = answer.plan;
    if (
      plan.metric !== c.metric ||
      plan.date !== "日期" ||
      [...plan.dimensions].sort().join() !== [...c.dimensions].sort().join() ||
      plan.current.start !== current.start ||
      plan.current.end !== current.end ||
      plan.previous.start !== previous.start ||
      plan.previous.end !== previous.end
    )
      throw new Error("计划口径不匹配：" + JSON.stringify(plan));
    if (c.knowledge && !plan.knowledgeIds.length)
      throw new Error("未引用检索定义。");
    const results = plan.dimensions.map((dimension) =>
      d.comparePeriods(dataset, profile, {
        ...plan,
        dimension,
        filters: c.filters,
      }),
    );
    if (
      results.some(
        (r) =>
          Math.abs(r.delta - c.delta) > 1e-9 ||
          Math.abs(r.groups.reduce((n, g) => n + g.delta, 0) - r.delta) > 1e-9,
      )
    )
      throw new Error("本机计算未通过独立期望校验。");
    return {
      mode: answer.mode,
      plan,
      actualDelta: results[0].delta,
      expectedDelta: c.delta,
      latencyMs: answer.latencyMs,
      usage: answer.usage,
    };
  });
}
for (const c of [
  {
    label: "利润率带原文回答",
    question: "总体利润率如何计算？",
    docs: definitions,
    status: "answered",
  },
  {
    label: "订单去重带原文回答",
    question: "同一订单有多行时，客单价怎么计算？",
    docs: definitions,
    status: "answered",
  },
  {
    label: "退款定义检索回答",
    question: "净收入是否应该扣除退款金额？",
    docs: definitions,
    status: "answered",
  },
  {
    label: "冲突定义必须提示",
    question: "净收入是否扣除退款？这两份规则有冲突吗？",
    docs: [
      definitions[0],
      {
        id: "income-v2",
        title: "收入统计规则",
        version: "2",
        source: "故意冲突的合成定义",
        text: "本评测的新规则规定净收入不扣除任何退款金额，已成功退款的订单也完全计入净收入。此规定与旧版本不同。",
      },
    ],
    status: "conflict",
  },
  {
    label: "无业务依据不得补造",
    question: "本公司的纳税申报周期是什么？",
    docs: [
      {
        id: "unrelated",
        title: "文件范围说明",
        version: "1",
        source: "合成文档",
        text: "本手册仅定义订单去重与利润率，不包含税种、纳税申报周期或税务规定。",
      },
    ],
    status: "insufficient",
    force: true,
  },
]) {
  await run(c.label, async () => {
    const snippets = c.force
      ? k.splitDocuments(c.docs)
      : k
          .retrieveKnowledge(c.question, c.docs)
          .map(({ score, coverage, ...s }) => s);
    if (!snippets.length) throw new Error("未检索到测试片段。");
    const a = await km.answerKnowledge(
      { question: c.question, snippets },
      config,
    );
    if (a.status !== c.status)
      throw new Error("预期" + c.status + "，实际" + a.status);
    return {
      mode: a.mode,
      status: a.status,
      answer: a.answer,
      citations: a.citations,
      sourceIds: snippets.map((s) => s.id),
      latencyMs: a.latencyMs,
      usage: a.usage,
    };
  });
}
await run("无命中不发起生成（本机检索检查）", () => {
  if (k.retrieveKnowledge("火星赤道直径多少公里", definitions).length)
    throw new Error("意外检索命中");
  return { mode: "local", providerCalls: 0 };
});
const report = {
  checkedAt: new Date().toISOString(),
  format: "datapilot-intelligence-evaluation",
  sourceFingerprint: hash.digest("hex"),
  model: config.model || "deepseek-flash",
  status: cases.every((c) => c.passed) ? "passed" : "failed",
  total: cases.length,
  passed: cases.filter((c) => c.passed).length,
  realModelCases: cases.filter((c) => c.mode === "model").length,
  syntheticFixtures: true,
  notice:
    "固定合成样本。9项真实服务检查与1项无命中本机检查，不代表通用准确率或真实用户效果。",
  cases,
};
writeFileSync(
  "outputs/intelligence-evaluation.json",
  JSON.stringify(report, null, 2),
);
console.log(
  report.passed +
    "/" +
    report.total +
    " checks passed; " +
    report.realModelCases +
    " real model cases.",
);
if (report.status !== "passed") process.exitCode = 1;
