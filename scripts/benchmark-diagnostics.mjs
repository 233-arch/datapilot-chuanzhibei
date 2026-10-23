import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
if (!isMainThread) {
  const e = await import(workerData.engine),
    d = await import(workerData.diagnostics);
  const measurements = [];
  for (let run = 0; run < 5; run++) {
    const t = performance.now(),
      dataset = e.parseCSV(workerData.csv, "20k.csv"),
      parsed = performance.now(),
      profile = e.profileDataset(dataset),
      profiled = performance.now(),
      result = d.comparePeriods(dataset, profile, {
        date: "日期",
        metric: "销售额",
        dimension: "地区",
        filters: [],
        ...d.periodDefaults(dataset, "日期"),
      });
    measurements.push({
      parseMs: +(parsed - t).toFixed(2),
      profileMs: +(profiled - parsed).toFixed(2),
      comparisonMs: +(performance.now() - profiled).toFixed(2),
      totalMs: +(performance.now() - t).toFixed(2),
    });
    if (result.groups.length !== 40 || profile.rowCount !== 20000)
      throw new Error("Invalid benchmark output");
  }
  parentPort.postMessage(measurements);
} else {
  mkdirSync("work/benchmark", { recursive: true });
  for (const name of ["data-engine", "diagnostics"]) {
    const code = transpileModule(readFileSync("lib/" + name + ".ts", "utf8"), {
      compilerOptions: {
        target: ScriptTarget.ES2022,
        module: ModuleKind.ES2022,
      },
    }).outputText.replace(/(["'])\.\/data-engine\1/g, '"./data-engine.mjs"');
    writeFileSync("work/benchmark/" + name + ".mjs", code);
  }
  const lines = ["日期,地区,品类,订单编号,销售额,利润,数量,折扣,渠道,客户类型"];
  for (let j = 0; j < 20000; j++) {
    const date = new Date(Date.UTC(2026, 0, 1 + (j % 180)))
      .toISOString()
      .slice(0, 10);
    lines.push(
      [
        date,
        "地区" + (j % 40),
        "品类" + (j % 12),
        "B" + String(j).padStart(6, "0"),
        100 + (j % 900),
        10 + (j % 90),
        1 + (j % 9),
        (j % 3) / 10,
        j % 2 ? "线上" : "线下",
        j % 4 ? "新客" : "老客",
      ].join(","),
    );
  }
  const csv = lines.join("\n");
  writeFileSync("outputs/performance-20000.csv", csv);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 5),
    start = performance.now();
  const worker = new Worker(new URL(import.meta.url), {
    workerData: {
      csv,
      engine: pathToFileURL(path.resolve("work/benchmark/data-engine.mjs"))
        .href,
      diagnostics: pathToFileURL(path.resolve("work/benchmark/diagnostics.mjs"))
        .href,
    },
  });
  const results = await new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code) reject(new Error("Benchmark worker exited " + code));
    });
  });
  clearInterval(timer);
  const report = {
    sourceFingerprint: createHash("sha256")
      .update(readFileSync("lib/data-engine.ts"))
      .update(readFileSync("lib/diagnostics.ts"))
      .update(readFileSync("scripts/benchmark-diagnostics.mjs"))
      .digest("hex"),
    date: new Date().toISOString(),
    runtime: "Node " + process.version,
    platform: process.platform,
    rows: 20000,
    columns: 10,
    bytes: Buffer.byteLength(csv),
    rounds: results,
    elapsedMs: Math.round(performance.now() - start),
    mainThreadTimerTicks: ticks,
    passed: ticks > 0,
    limitations:
      "本机Node Worker线程的固定合成样本测试，不是浏览器、托管服务器或并发负载性能承诺。",
  };
  writeFileSync(
    "outputs/performance-evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
