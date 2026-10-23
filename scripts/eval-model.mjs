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
  cases.push(
    {q:'按地区统计记录数',dim:'地区',metric:'',agg:'count',points:{华东:4,华南:4}},
    {q:'按地区统计利润合计',dim:'地区',metric:'利润',agg:'sum',points:{华东:50,华南:441}},
    {q:'按地区计算销售额平均值',dim:'地区',metric:'销售额',agg:'mean',points:{华东:125,华南:1102.5}},
    {q:'按地区查看销售额最小值',dim:'地区',metric:'销售额',agg:'min',points:{华东:100,华南:120}},
    {q:'按地区查看销售额最大值',dim:'地区',metric:'销售额',agg:'max',points:{华东:150,华南:4000}},
    {q:'按地区查看利润最小值',dim:'地区',metric:'利润',agg:'min',points:{华东:10,华南:12}},
    {q:'按地区查看利润最大值',dim:'地区',metric:'利润',agg:'max',points:{华东:15,华南:400}},
    {q:'按产品类别统计销售额合计',dim:'产品类别',metric:'销售额',agg:'sum',points:{配件:520,家居:4390}},
    {q:'按产品类别统计利润合计',dim:'产品类别',metric:'利润',agg:'sum',points:{配件:52,家居:439}},
    {q:'按产品类别计算销售额平均值',dim:'产品类别',metric:'销售额',agg:'mean',points:{配件:130,家居:1097.5}},
    {q:'按产品类别统计记录数',dim:'产品类别',metric:'',agg:'count',points:{配件:4,家居:4}},
    {q:'按渠道统计销售额合计',dim:'渠道',metric:'销售额',agg:'sum',points:{线上:520,线下:4390}},
    {q:'按渠道统计利润合计',dim:'渠道',metric:'利润',agg:'sum',points:{线上:52,线下:439}},
    {q:'按渠道计算销售额平均值',dim:'渠道',metric:'销售额',agg:'mean',points:{线上:130,线下:1097.5}},
    {q:'按月查看利润合计趋势',dim:'日期',metric:'利润',agg:'sum',points:{'2026-01':46,'2026-02':445}},
    {q:'按月统计记录数趋势',dim:'日期',metric:'',agg:'count',points:{'2026-01':4,'2026-02':4}},
    {q:'只看华东，按产品类别计算利润合计',dim:'产品类别',metric:'利润',agg:'sum',points:{配件:24,家居:26}},
    {q:'只看华南，按产品类别计算销售额合计',dim:'产品类别',metric:'销售额',agg:'sum',points:{配件:280,家居:4130}},
    {q:'只看线上渠道，按地区统计销售额合计',dim:'地区',metric:'销售额',agg:'sum',points:{华东:240,华南:280}},
    {q:'只看线下渠道，按地区统计销售额合计',dim:'地区',metric:'销售额',agg:'sum',points:{华东:260,华南:4130}},
    {q:'销售额大于等于150的记录，按地区统计销售额合计',dim:'地区',metric:'销售额',agg:'sum',points:{华东:150,华南:4160}},
    {q:'日期从2026-02-01到2026-02-28，按地区统计销售额合计',dim:'地区',metric:'销售额',agg:'sum',points:{华东:290,华南:4160}},
    {q:'改成最大值',dim:'地区',metric:'利润',agg:'max',previousPlan:{...e.defaultPlan(profile),groupBy:'地区',metric:'利润',aggregate:'mean'},points:{华东:15,华南:400}},
    {q:'只看华南',dim:'地区',metric:'利润',agg:'mean',previousPlan:{...e.defaultPlan(profile),groupBy:'地区',metric:'利润',aggregate:'mean'},points:{华南:110.25}}
  );
  cases.push({q:'哪个地区表现最好，以利润合计为指标',dim:'地区',metric:'利润',agg:'sum',previousPlan:e.defaultPlan(profile),points:{华东:50,华南:441}});
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
    latencyMs: {median: [...results].sort((a,b)=>a.latencyMs-b.latencyMs)[Math.floor(results.length/2)]?.latencyMs, p95:[...results].sort((a,b)=>a.latencyMs-b.latencyMs)[Math.min(results.length-1,Math.ceil(results.length*.95)-1)]?.latencyMs},
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
