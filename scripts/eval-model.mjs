import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const out = path.resolve("work/model-eval");
mkdirSync(out, { recursive: true });
mkdirSync("outputs", { recursive: true });
const config = {
  key: process.env.DATA_MODEL_API_KEY?.trim(),
  url: process.env.DATA_MODEL_URL,
  model: process.env.DATA_MODEL_NAME,
};
const sourceFingerprint = createHash("sha256")
  .update(readFileSync("lib/data-engine.ts"))
  .update(readFileSync("lib/agent.ts"))
  .update(readFileSync("scripts/eval-model.mjs"))
  .digest("hex");
if (!config.key) {
  const result = {
    status: "blocked",
    date: new Date().toISOString(),
    mode: "unconfigured",
    reason:
      "未配置 DATA_MODEL_API_KEY，未调用真实模型；模拟测试不作为真实模型证据。",
  };
  writeFileSync(
    "outputs/model-evaluation.json",
    JSON.stringify(result, null, 2),
  );
  console.log(result.reason);
  process.exitCode = 2;
} else {
  for (const name of ["data-engine", "agent"]) {
    const source = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), {
      compilerOptions: {
        target: ScriptTarget.ES2022,
        module: ModuleKind.ES2022,
      },
    }).outputText.replace(/(["'])\.\/data-engine\1/g, '"./data-engine.mjs"');
    writeFileSync(path.join(out, `${name}.mjs`), source);
  }
  const e = await import(pathToFileURL(path.join(out, "data-engine.mjs")));
  const a = await import(pathToFileURL(path.join(out, "agent.mjs")));
  const dataset = e.parseCSV(
    readFileSync("docs/samples/innovation.csv", "utf8"),
  );
  const profile = e.profileDataset(dataset);
  profile.fields.find((f) => f.name === "销售额").aliases = ["营收"];
  const cases = [
    {
      q: "按地区统计销售额合计",
      dim: "地区",
      metric: "销售额",
      agg: "sum",
      points: { 华东: 500, 华南: 4410 },
    },
    {
      q: "各地区平均利润",
      dim: "地区",
      metric: "利润",
      agg: "mean",
      points: { 华东: 12.5, 华南: 110.25 },
    },
    {
      q: "按月查看销售额合计趋势",
      dim: "日期",
      metric: "销售额",
      agg: "sum",
      points: { "2026-01": 460, "2026-02": 4450 },
    },
    {
      q: "按地区统计营收合计",
      dim: "地区",
      metric: "销售额",
      agg: "sum",
      points: { 华东: 500, 华南: 4410 },
    },
    {
      q: "只看华东，按产品类别计算销售额合计",
      dim: "产品类别",
      metric: "销售额",
      agg: "sum",
      points: { 配件: 240, 家居: 260 },
    },
    {
      q: "改成均值",
      dim: "地区",
      metric: "利润",
      agg: "mean",
      previousPlan: {
        ...e.defaultPlan(profile),
        groupBy: "地区",
        metric: "利润",
        aggregate: "sum",
      },
      points: { 华东: 12.5, 华南: 110.25 },
    },
  ];
  const results = [];
  for (const c of cases) {
    const started = performance.now();
    try {
      const answer = await a.createPlan(c.q, profile, config, fetch, {
        previousPlan: c.previousPlan,
      });
      if (answer.mode !== "model")
        throw new Error("真实模型评测禁止回退到演示模式。");
      const computed = e.executePlan(dataset, profile, answer.plan),
        actual = Object.fromEntries(
          computed.points.map((p) => [p.name, p.value]),
        );
      const pass =
        answer.plan.groupBy === c.dim &&
        answer.plan.metric === c.metric &&
        answer.plan.aggregate === c.agg &&
        Object.keys(actual).length === Object.keys(c.points).length &&
        Object.entries(c.points).every(
          ([key, v]) => Math.abs((actual[key] ?? Infinity) - v) < 1e-6,
        );
      results.push({
        question: c.q,
        pass,
        mode: answer.mode,
        plan: answer.plan,
        expected: c.points,
        actual,
        latencyMs: Math.round(performance.now() - started),
      });
      console.log(`${pass ? "PASS" : "FAIL"} ${c.q}`);
    } catch (error) {
      results.push({
        question: c.q,
        pass: false,
        error: error instanceof Error ? error.message : "请求失败",
        latencyMs: Math.round(performance.now() - started),
      });
      console.log(`FAIL ${c.q}`);
    }
  }
  const report = {
    status: results.every((r) => r.pass) ? "passed" : "failed",
    mode: "model",
    sourceFingerprint,
    model: config.model || "deepseek-flash",
    date: new Date().toISOString(),
    dataset: "8行合成样本",
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    results,
    limitations: "固定小样本回归，不能据此宣称通用准确率。未记录密钥与请求头。",
  };
  writeFileSync(
    "outputs/model-evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    `真实模型固定集：${report.passed}/${report.total}；outputs/model-evaluation.json`,
  );
  if (report.status !== "passed") process.exitCode = 1;
}
