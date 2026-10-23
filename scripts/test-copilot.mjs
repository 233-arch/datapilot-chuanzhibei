import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/copilot-tests");
mkdirSync(out, {recursive:true});
for (const name of ["data-engine", "copilot", "agent"]) {
  const source = transpileModule(readFileSync(`lib/${name}.ts`,"utf8"), {compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ES2022}}).outputText.replace(/(["'])\.\/data-engine\1/g, '"./data-engine.mjs"');
  writeFileSync(path.join(out,`${name}.mjs`),source);
}
const e = await import(pathToFileURL(path.join(out,"data-engine.mjs")));
const c = await import(pathToFileURL(path.join(out,"copilot.mjs")));
const a = await import(pathToFileURL(path.join(out,"agent.mjs")));
let count = 0;
async function test(name,fn) {await fn();count++;console.log(`PASS ${name}`);}
const dataset = e.parseCSV("日期,地区,渠道,金额\n2026-01-01,华东,线上,100\n2026-01-02,华东,线下,\n2026-02-01,华南,线上,200\n2026-02-02,华南,线下,300");
const profile = e.profileDataset(dataset);
const plan = {...e.defaultPlan(profile), groupBy:"地区",metric:"金额",aggregate:"sum",filters:[{field:"地区",operator:"eq",value:"华东"}]};
const initial = {datasetId:dataset.id,steps:[],cursor:-1};
await test("Plan preview preserves source and existing scope; replacing one filter keeps others", () => {
  const before = JSON.stringify(dataset);
  const current = {...plan,filters:[...plan.filters,{field:"渠道",operator:"eq",value:"线上"}]};
  const proposal = {...plan,filters:[{field:"地区",operator:"eq",value:"华南"}]};
  const preview = c.proposeAnalysis(dataset,profile,current,proposal);
  assert.equal(preview.result.matchedRows,1);
  assert.equal(preview.result.points[0].value,200);
  assert.equal(preview.plan.filters.length,2);
  assert.equal(JSON.stringify(dataset),before);
  assert.equal(current.filters[0].value,"华东");
});
await test("Untrusted model proposal cannot invent fields or bypass filter validation", () => {
  assert.throws(() => c.proposeAnalysis(dataset,profile,plan,{...plan,metric:"伪造指标"}));
  assert.throws(() => c.proposeAnalysis(dataset,profile,plan,{...plan,filters:[{field:"金额",operator:"gte",value:"代码"}]}));
});
await test("Navigation recommendations use the actual scoped missing rows and preserve scope", () => {
  const tasks = c.explorationTasks(dataset,profile,plan);
  const missing = tasks.find(t => t.kind === "quality");
  assert.ok(missing.reason.includes("1 条"));
  const preview = c.proposeAnalysis(dataset,profile,plan,missing.plan);
  assert.equal(preview.result.matchedRows,1);
  assert.equal(preview.result.validRows,1);
  assert.equal(preview.plan.aggregate,"count");
  const trend = tasks.find(t => t.id === "trend");
  assert.equal(trend.plan.chart,"line");
  assert.equal(trend.plan.sort,"natural");
  assert.deepEqual(trend.plan.filters,plan.filters);
  assert.ok(!c.explorationTasks(dataset,profile,{...plan,filters:[{field:"地区",operator:"eq",value:"无匹配"}]}).length);
});
await test("Eight scope conditions cannot be silently dropped to add a navigation condition", () => {
  const columns = Array.from({length:8},(_,i)=>`维度${i}`);
  const sample = e.parseCSV([...columns,"金额"].join(",")+"\n"+columns.map(()=>"x").join(",")+",\n"+columns.map(()=>"x").join(",")+",100");
  const p = e.profileDataset(sample);
  const filters = columns.map(field=>({field,operator:"contains",value:"x"}));
  assert.ok(!c.explorationTasks(sample,p,{...e.defaultPlan(p),filters}).some(t=>t.kind==="quality"));
});
await test("Journey deduplicates equal snapshots and takes immutable copies", () => {
  const mutable = structuredClone(plan);
  const first = c.recordJourney(initial,dataset.id,mutable,profile,"first","2026-10-22T00:00:00Z");
  assert.equal(c.recordJourney(first,dataset.id,structuredClone(plan),profile,"ignored","later"),first);
  mutable.filters[0].value="华南";
  assert.equal(first.steps[0].plan.filters[0].value,"华东");
});
await test("Restoring a snapshot then editing creates a bounded new branch", () => {
  let state = initial;
  for(let i=0;i<25;i++) state = c.recordJourney(state,dataset.id,{...plan,title:`step-${i}`,limit:i+1},profile,String(i),"now");
  assert.equal(state.steps.length,20);
  assert.equal(state.cursor,19);
  state = {...state,cursor:3};
  state = c.recordJourney(state,dataset.id,{...plan,title:"new branch"},profile,"branch","now");
  assert.equal(state.steps.length,5);
  assert.equal(state.steps.at(-1).id,"branch");
  assert.ok(!state.steps.some(s=>s.id==="24"));
});
await test("Journey cannot restore another dataset or invalid persisted plans", () => {
  const first = c.recordJourney(initial,dataset.id,plan,profile,"first","now");
  assert.equal(c.restoreJourney(first,"different-data",profile).steps.length,0);
  const broken = {...first,steps:[first.steps[0],{...first.steps[0],id:"broken",plan:{...plan,groupBy:"不存在"}}],cursor:1};
  const restored = c.restoreJourney(broken,dataset.id,profile);
  assert.equal(restored.steps.length,1);
  assert.equal(restored.cursor,0);
  const next = c.recordJourney(first,"new-data",plan,profile,"new","now");
  assert.equal(next.steps.length,1);
  assert.equal(next.datasetId,"new-data");
});
await test("Cancelling the client request also aborts the provider request", async () => {
  const controller = new AbortController();
  controller.abort();
  let propagated = false;
  await assert.rejects(a.createPlan("各地区金额合计",profile,{key:"mock-only",url:"https://example.invalid"},async (_url,options) => {
    propagated = options.signal.aborted;
    options.signal.throwIfAborted();
  },{signal:controller.signal}),{name:"AbortError"});
  assert.equal(propagated,true);
});
await test("Provider endpoint rejects credentials and non-HTTP loopback protocols before sending a key", async () => {
  for(const url of ["ftp://localhost","https://user:password@example.invalid","https://example.invalid?token=x","https://example.invalid#fragment"]) {
    await assert.rejects(a.createPlan("各地区金额合计",profile,{key:"mock-only",url},async () => {throw new Error("must not fetch");}),/HTTPS/);
  }
});
await test("DeepSeek forced tool calls disable default thinking without changing other providers", async () => {
  for (const base of ["https://api.deepseek.com", "https://api.deepseek.com/v1", "https://example.invalid/v1"]) {
    let body;
    const answer = await a.createPlan("按地区统计金额合计",profile,{key:"mock-only",url:base},async (_url,options) => {
      body = JSON.parse(options.body);
      return Response.json({choices:[{message:{tool_calls:[{function:{name:"create_analysis_plan",arguments:JSON.stringify(plan)}}]}}]});
    });
    assert.equal(answer.mode,"model");
    assert.equal(body.tool_choice.function.name,"create_analysis_plan");
    if (new URL(base).hostname === "api.deepseek.com") assert.deepEqual(body.thinking,{type:"disabled"});
    else assert.equal(Object.hasOwn(body,"thinking"),false);
  }
});
console.log(`\n${count} copilot checks passed.`);
