import assert from "node:assert/strict";
const base = process.env.DATAPILOT_TEST_URL || "http://127.0.0.1:5173";
const timeout = () => AbortSignal.timeout(15000);
const state = await fetch(`${base}/api/analyze`, { signal: timeout() });
assert.equal(state.status, 200);
const mode = (await state.json()).mode;
assert.ok(["demo", "model"].includes(mode));
const invalid = await fetch(`${base}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question: "x" }),
  signal: timeout(),
});
assert.equal(invalid.status, 400);
const oversized = await fetch(`${base}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "x".repeat(100001),
  signal: timeout(),
});
assert.equal(oversized.status, 413);
if (mode === "demo") {
  const profile = {
    rowCount: 3,
    columnCount: 2,
    missing: 0,
    duplicates: 0,
    completeness: 100,
    quality: 100,
    fields: [
      {
        name: "地区",
        type: "text",
        missing: 0,
        invalid: 0,
        unique: 2,
        topValues: [
          { value: "华东", count: 2 },
          { value: "华南", count: 1 },
        ],
      },
      {
        name: "销售额",
        type: "number",
        missing: 0,
        invalid: 0,
        unique: 3,
        min: 100,
        max: 300,
        mean: 200,
        topValues: [],
      },
    ],
  };
  const result = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "各地区平均销售额", profile }),
    signal: timeout(),
  });
  assert.equal(result.status, 200);
  assert.ok(result.headers.get("content-type").includes("text/event-stream"));
  const stream = await result.text();
  const event = stream.split("\n\n").find((s) => s.startsWith("event: result"));
  assert.ok(event);
  const payload = JSON.parse(event.match(/data: (.+)/)[1]);
  assert.equal(payload.mode, "demo");
  assert.equal(payload.plan.groupBy, "地区");
  assert.equal(payload.plan.metric, "销售额");
  assert.equal(payload.plan.aggregate, "mean");
  const followup = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "只看华南",
      profile,
      previousPlan: payload.plan,
    }),
    signal: timeout(),
  });
  const followupEvent = (await followup.text())
    .split("\n\n")
    .find((s) => s.startsWith("event: result"));
  assert.ok(followupEvent);
  const followupPlan = JSON.parse(followupEvent.match(/data: (.+)/)[1]).plan;
  assert.equal(followupPlan.metric, "销售额");
  assert.equal(followupPlan.aggregate, "mean");
  assert.equal(followupPlan.filter.value, "华南");
  const invalidContext = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "改成均值",
      profile,
      previousPlan: { ...payload.plan, groupBy: "不存在的字段" },
    }),
    signal: timeout(),
  });
  assert.ok((await invalidContext.text()).includes("event: error"));
  const unsupported = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "预测下个月销售额", profile }),
    signal: timeout(),
  });
  assert.ok((await unsupported.text()).includes("event: error"));
}
console.log(
  "PASS HTTP status, invalid payload, request limits, SSE analysis, contextual filters, invalid context and honest unsupported-intent errors.",
);
