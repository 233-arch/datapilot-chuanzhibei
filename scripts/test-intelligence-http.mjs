import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export async function verifyIntelligenceHttp(base, extraHeaders = {}) {
  const origin = new URL(base).origin;
  const headers = {
    "Content-Type": "application/json",
    Origin: origin,
    ...extraHeaders,
  };
  const post = (route, body) =>
    fetch(origin + route, {
      method: "POST",
      headers,
      redirect: "error",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });
  const status = await fetch(origin + "/api/analyze", {
    headers: extraHeaders,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(status.status, 200);
  const mode = (await status.json()).mode;
  if (mode !== "model") {
    for (const route of ["/api/workflow", "/api/knowledge"])
      assert.equal((await post(route, {})).status, 409);
    return { mode, unconfiguredRejected: true, realModelChecked: false };
  }
  assert.equal((await post("/api/workflow", {})).status, 400);
  assert.equal(
    (await post("/api/knowledge", { question: "test", snippets: [] })).status,
    400,
  );
  const fields = [
    {
      name: "日期",
      type: "date",
      missing: 0,
      invalid: 0,
      unique: 2,
      topValues: [],
    },
    {
      name: "地区",
      type: "text",
      missing: 0,
      invalid: 0,
      unique: 2,
      topValues: [],
    },
    {
      name: "销售额",
      type: "number",
      missing: 0,
      invalid: 0,
      unique: 4,
      min: 10,
      max: 40,
      mean: 25,
      topValues: [],
    },
  ];
  const profile = {
    rowCount: 4,
    columnCount: 3,
    missing: 0,
    duplicates: 0,
    completeness: 100,
    quality: 100,
    fields,
  };
  const current = { start: "2026-02-01", end: "2026-02-28" },
    previous = { start: "2026-01-01", end: "2026-01-31" };
  const pr = await post("/api/workflow", {
    question: "比较2026年2月与1月的销售额合计，按地区分解",
    profile,
    filters: [],
    contexts: [{ date: "日期", current, previous }],
    snippets: [],
  });
  assert.equal(pr.status, 200);
  const workflow = await pr.json();
  assert.equal(workflow.mode, "model");
  assert.equal(workflow.plan.date, "日期");
  assert.equal(workflow.plan.metric, "销售额");
  assert.deepEqual(workflow.plan.dimensions, ["地区"]);
  assert.deepEqual(workflow.plan.current, current);
  assert.deepEqual(workflow.plan.previous, previous);
  const snippet = {
    id: "margin:1",
    documentId: "margin",
    title: "利润率定义",
    text: "本示例的总体利润率按利润合计除以销售额合计计算，不是逐行利润率的平均值。",
    version: "1",
    source: "固定合成定义",
    index: 1,
  };
  const kr = await post("/api/knowledge", {
    question: "总体利润率如何计算？",
    snippets: [snippet],
  });
  assert.equal(kr.status, 200);
  const knowledge = await kr.json();
  assert.equal(knowledge.mode, "model");
  assert.equal(knowledge.status, "answered");
  assert.ok(
    knowledge.citations.length > 0 &&
      knowledge.citations.every(
        (c) => c.id === snippet.id && snippet.text.includes(c.quote),
      ),
  );
  const facts = [
    {
      id: "current",
      title: "本期合计",
      value: 70,
      unit: "元",
      detail: "两条固定合成记录",
    },
    {
      id: "previous",
      title: "基期合计",
      value: 30,
      unit: "元",
      detail: "两条固定合成记录",
    },
    {
      id: "delta",
      title: "变化金额",
      value: 40,
      unit: "元",
      detail: "本期减去基期",
    },
  ];
  const er = await post("/api/explain", { facts });
  assert.equal(er.status, 200);
  const evidence = await er.json();
  assert.equal(evidence.mode, "model");
  assert.ok(
    evidence.focus.length > 0 &&
      evidence.focus.every((id) => facts.some((f) => f.id === id)),
  );
  const cross = await fetch(origin + "/api/knowledge", {
    method: "POST",
    headers: { ...headers, Origin: "https://other.example" },
    redirect: "error",
    body: JSON.stringify({ question: "利润率如何计算", snippets: [snippet] }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(cross.status, 403);
  return {
    mode,
    realModelChecked: true,
    invalidRequestsRejected: true,
    sameOriginAllowed: true,
    crossOriginRejected: true,
    workflow: {
      plan: workflow.plan,
      usage: workflow.usage,
      latencyMs: workflow.latencyMs,
    },
    knowledge: {
      status: knowledge.status,
      citations: knowledge.citations,
      usage: knowledge.usage,
      latencyMs: knowledge.latencyMs,
    },
    evidence: {
      focus: evidence.focus,
      usage: evidence.usage,
      latencyMs: evidence.latencyMs,
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const base = process.env.DATAPILOT_TEST_URL || "http://127.0.0.1:5173";
  const result = {
    checkedAt: new Date().toISOString(),
    url: base,
    ...(await verifyIntelligenceHttp(base)),
  };
  mkdirSync("outputs", { recursive: true });
  writeFileSync(
    "outputs/intelligence-http.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
}
