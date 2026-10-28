import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/workspace-regressions");
mkdirSync(out, { recursive: true });
for (const name of ["data-engine", "agent", "workspace-presentation", "visitor-credentials", "visitor-connection"]) {
  const code = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), {
    compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
  }).outputText.replace(/(["'])\.\/([a-z-]+)\1/g, '"./$2.mjs"');
  writeFileSync(path.join(out, name + ".mjs"), code);
}
const use = name => import(pathToFileURL(path.join(out, name + ".mjs")));
const [e, a, ui, api] = await Promise.all(["data-engine", "agent", "workspace-presentation", "visitor-connection"].map(use));
let passed = 0;
async function test(name, run) { await run(); passed++; console.log("PASS " + name); }
const single = e.parseCSV("地区,金额\n" + Array.from({ length: 12 }, (_, i) => `区域${i + 1},${(i + 1) * 10}`).join("\n") + "\n区域13,错误值");
await test("invalid-only table warns even when completeness/duplicate score is 100", () => {
  const p = e.profileDataset(single);
  assert.equal(p.quality, 100); assert.equal(p.missing, 0); assert.equal(p.duplicates, 0);
  assert.deepEqual(ui.qualityStatus(p), { invalid: 1, issues: 1, title: "发现可以改善的数据质量问题" });
  const result = e.executePlan(single, p, { ...e.defaultPlan(p), metric: "金额", aggregate: "sum", limit: 30 });
  assert.equal(result.validRows, 12); assert.equal(result.excluded, 1);
  assert.equal(result.points.reduce((sum, point) => sum + point.value, 0), 780);
});
await test("clean and missing/duplicate tables have consistent quality summaries", () => {
  assert.equal(ui.qualityStatus(e.profileDataset(e.parseCSV("地区,金额\n华东,10\n华南,20"))).issues, 0);
  const status = ui.qualityStatus(e.profileDataset(e.parseCSV("地区,金额\n华东,\n华东,")));
  assert.ok(status.issues > 0); assert.equal(status.title, "发现可以改善的数据质量问题");
});
await test("suggestions are distinct and grounded across sparse table shapes", async () => {
  const fixtures = [single, e.parseCSV("地区\n华东\n华南"), e.parseCSV("金额\n10\n20"),
    e.parseCSV("日期,金额\n2026-01-01,10\n2026-02-01,20"), e.makeDemo()];
  for (const dataset of fixtures) {
    const profile = e.profileDataset(dataset), questions = ui.starterQuestions(profile);
    assert.ok(questions.length >= 2); assert.equal(questions.length, new Set(questions).size);
    for (const question of questions) {
      const answer = await a.createPlan(question, profile, {});
      const plan = answer.plan;
      assert.ok(plan, question); e.executePlan(dataset, profile, plan);
      assert.ok(profile.fields.some(field => question.includes(field.name)), question);
    }
  }
  assert.deepEqual(ui.starterQuestions({ fields: [] }), []);
});
const previous = { provider: "deepseek", key: "previous-test-credential", model: "deepseek-flash" };
const candidate = { provider: "openai", key: "candidate-test-credential", model: "test-model" };
const response = (ok, status = 200) => Response.json({ ok, message: ok ? "验证通过" : "认证失败" }, { status });
await test("candidate headers are probed without replacing active credentials on failure", async () => {
  let active = previous;
  const connection = api.createVisitorConnection(config => { active = config; }, async (_, init) => {
    assert.equal(active, previous); assert.equal(init.headers["X-DataPilot-Api-Key"], candidate.key);
    return response(false, 502);
  });
  assert.equal((await connection.connect(candidate)).ok, false); assert.equal(active, previous);
});
await test("only HTTP success plus an affirmative health result applies normalized credentials", async () => {
  for (const [ok, status] of [[false, 200], [true, 502], [true, 200]]) {
    let active = previous;
    const connection = api.createVisitorConnection(config => { active = config; }, async () => response(ok, status));
    const result = await connection.connect({ ...candidate, key: ` ${candidate.key} ` });
    assert.equal(result.ok, ok && status === 200);
    assert.deepEqual(active, result.ok ? candidate : previous);
  }
});
await test("network, malformed JSON and invalid format never apply a candidate", async () => {
  for (const request of [async () => { throw new Error("network"); }, async () => new Response("not-json")]) {
    const connection = api.createVisitorConnection(() => assert.fail("must not apply"), request);
    assert.equal((await connection.connect(candidate)).ok, false);
  }
  let requests = 0;
  const connection = api.createVisitorConnection(() => assert.fail("must not apply"), async () => { requests++; return response(true); });
  assert.equal((await connection.connect({ ...candidate, key: "short" })).ok, false); assert.equal(requests, 0);
});
await test("canceled checks cannot apply even when a transport ignores AbortSignal", async () => {
  let release, signal;
  const connection = api.createVisitorConnection(() => assert.fail("canceled result applied"), (_, init) => {
    signal = init.signal; return new Promise(resolve => { release = resolve; });
  });
  const result = connection.connect(candidate); connection.cancel();
  assert.equal(signal.aborted, true); release(response(true)); assert.equal(await result, null);
});
await test("late older success cannot overwrite a newer accepted configuration", async () => {
  let active = previous;
  const releases = [];
  const connection = api.createVisitorConnection(config => { active = config; }, () => new Promise(resolve => releases.push(resolve)));
  const older = connection.connect(previous), newer = connection.connect(candidate);
  releases[1](response(true)); assert.equal((await newer).ok, true);
  releases[0](response(true)); assert.equal(await older, null); assert.deepEqual(active, candidate);
});
console.log(`Workspace regressions: ${passed} passed`);
