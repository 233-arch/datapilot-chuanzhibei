import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
const output = path.resolve("work/product-tests"); mkdirSync(output, { recursive: true });
const compiled = new Set();
function compile(name) {
  if (compiled.has(name)) return; compiled.add(name);
  const code = transpileModule(readFileSync(`lib/${name}.ts`, "utf8"), { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText.replace(/from (["'])\.\/([^"']+)\1/g, (_,q,dep) => { compile(dep); return `from "./${dep}.mjs"`; });
  writeFileSync(path.join(output, name + ".mjs"), code);
}
for (const name of ["workspace-backup", "local-store", "analysis-templates", "context-actions", "report-bundle"]) compile(name);
const use = name => import(pathToFileURL(path.join(output, name + ".mjs")));
const [e, s, backup, draft, templates, context, reports, kit, local] = await Promise.all(["data-engine", "workspace-snapshot", "workspace-backup", "report-draft", "analysis-templates", "context-actions", "report-bundle", "workspace-kit", "local-store"].map(use));
globalThis.indexedDB = new IDBFactory(); globalThis.IDBKeyRange = IDBKeyRange;
const dataset = e.parseCSV("日期,场所,金额\n2026-01-01,食堂,10\n2026-01-02,便利店,20\n2026-02-01,食堂,30", "工作流测试.csv"), profile = e.profileDataset(dataset);
const base = s.restoreSnapshot({ dataset }, profile);
const item = reports.collectReportAnalyses(base.plan, [], [])[0];
base.reportDraft = { ...draft.emptyDraft(), title: "期末报告 <script>bad()</script>", omitted: [], order: [item.key], notes: { [item.key]: { finding: "观察 <b>60</b>", evidence: "原始3条", recommendation: "核验后行动" } } };
base.tools.rules = [{ id: "required", kind: "required", field: "金额" }];
base.entries = [{ id: "entry", question: "金额合计", plan: base.plan, mode: "demo", retrieved: [], result: e.executePlan(dataset, profile, base.plan) }];
let passed = 0;
async function test(name, run) { await run(); passed++; console.log("PASS " + name); }
async function transaction(mode, run) { const db = await new Promise((resolve,reject) => { const req = indexedDB.open("datapilot-local-v1",1); req.onupgradeneeded=()=>req.result.createObjectStore("workspace"); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); try { return await new Promise((resolve,reject)=> { const tx=db.transaction("workspace",mode); const result=run(tx.objectStore("workspace"),tx); tx.oncomplete=()=>resolve(result); tx.onabort=tx.onerror=()=>reject(tx.error || new Error("aborted")); }); } finally { db.close(); } }
async function raw(key) { let value; await transaction("readonly", store => { const req=store.get(key); req.onsuccess=()=>{value=req.result;}; }); return value; }
await test("Backup roundtrip keeps draft, notes, rules and computed results while excluding credentials", async () => {
  const text=await backup.createBackup({...base, apiKey:"DO-NOT-SAVE", visitorModel:{key:"DO-NOT-SAVE"}});
  assert.ok(!text.includes("DO-NOT-SAVE"));
  const result=await backup.inspectBackup(text); assert.deepEqual(result.snapshot.reportDraft,base.reportDraft); assert.deepEqual(result.snapshot.tools.rules,base.tools.rules);
  assert.equal(result.snapshot.entries[0].result.points.reduce((a,p)=>a+p.value,0),60);
  const imported=backup.importedSnapshot(result.snapshot); assert.notEqual(imported.dataset.id,dataset.id); assert.equal(imported.tools.datasetId,imported.dataset.id); assert.equal(imported.journey.datasetId,imported.dataset.id); assert.equal(draft.datasetMarker(imported.dataset),draft.datasetMarker(dataset));
});
await test("Corrupt and unsupported backups are rejected before restore",async()=> {
  const good=JSON.parse(await backup.createBackup(base));
  await assert.rejects(()=>backup.inspectBackup("bad json"),/JSON/);
  await assert.rejects(()=>backup.inspectBackup(JSON.stringify({...good,version:99})),/版本/);
  good.workspace.dataset.rows[0].金额=900; await assert.rejects(()=>backup.inspectBackup(JSON.stringify(good)),/校验/);
});
await test("Report order and selection survive snapshot restore; notes and title escape HTML and Markdown",()=> {
  const second={...base.plan,title:"场所比较",groupBy:"场所"}; const all=reports.collectReportAnalyses(base.plan,[{plan:second}],[]);
  const d={...base.reportDraft, order:[all[1].key,all[0].key],omitted:[all[0].key]};
  const restored=s.restoreSnapshot({...base,reportDraft:d},profile); const list=draft.draftAnalyses(reports.selectReportAnalyses(draft.orderReportItems(all,restored.reportDraft.order),restored.reportDraft.omitted),restored.reportDraft);
  assert.equal(list.length,1);assert.equal(list[0].plan.title,second.title);
  const annotated=draft.draftAnalyses([item],base.reportDraft), meta={title:base.reportDraft.title,version:draft.datasetMarker(dataset),review:"待人工核验"};
  const html=kit.reportHTML(dataset,profile,annotated,{},[],meta), md=reports.markdownReport(dataset,profile,annotated,{},[],meta);
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>bad")); assert.ok(html.includes("核验后行动")); assert.ok(md.includes("&#60;script&#62;")); assert.ok(md.includes("原始3条"));
});
await test("Change markers detect changed data and remain stable across imported IDs",()=> {
  assert.notEqual(draft.datasetMarker(dataset),draft.datasetMarker({...dataset,rows:[...dataset.rows,{日期:"2026-03-01",场所:"食堂",金额:5}]}));
  assert.equal(draft.datasetMarker(dataset),draft.datasetMarker({...dataset,id:"different"}));
});
await test("Templates require typed mappings, compute exact sums and do not mutate data",()=> {
  for(const id of ["campus","retail"]) { const map=templates.suggestMapping(id,profile), result=templates.buildTemplate(id,map,dataset,profile); assert.equal(result.plans.length,3); assert.equal(result.rules.length,3); result.plans.forEach(plan=>assert.equal(e.executePlan(dataset,profile,plan).points.reduce((sum,p)=>sum+p.value,0),60)); }
  assert.throws(()=>templates.buildTemplate("campus",{date:"金额",amount:"金额",category:"场所"},dataset,profile),/日期/);
  assert.equal(dataset.rows[0].金额,"10");
});
await test("Negative or zero category totals fall back from pie to bar",()=> {
  const negative={...dataset,rows:dataset.rows.map(r=>({...r,金额:-10}))}, p=e.profileDataset(negative);
  const t=templates.buildTemplate("campus",templates.suggestMapping("campus",p),negative,p); assert.equal(t.plans[2].chart,"bar"); assert.equal(t.warnings.length,1);
});
await test("Context actions match page intent and omit unsupported trends",()=> {
  assert.ok(context.contextActions("quality",profile,base.plan).some(a=>a.kind==="audit"));
  assert.ok(context.contextActions("reports",profile,base.plan).some(a=>a.id==="report-check"));
  const p=e.profileDataset(e.parseCSV("场所\n食堂\n便利店")); assert.ok(!context.contextActions("charts",p,e.defaultPlan(p)).some(a=>a.id==="trend"));
});
await test("Legacy IndexedDB workspaces migrate without data loss",async()=> {
  await transaction("readwrite",store=>store.put(base,"current"));
  const value=await local.readWorkspace(); assert.equal(value.dataset.rows.length,3); await local.writeWorkspace(value);
  assert.equal((await raw("current")).format,2); assert.equal((await local.readWorkspace()).reportDraft.title,base.reportDraft.title);
});
await test("Configuration-only saves do not rewrite large dataset payload",async()=> {
  let payloadWrites=0;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(String(key).startsWith("data:"))payloadWrites++;return put.call(this,value,key);};
  try { await local.writeWorkspace({...base,tab:"quality"});await local.writeWorkspace({...base,tab:"charts"});assert.equal(payloadWrites,0); } finally {IDBObjectStore.prototype.put=put;}
});
await test("Concurrent saves stay ordered, with newest configuration retained",async()=> {
  await Promise.all([local.writeWorkspace({...base,tab:"quality"}),local.writeWorkspace({...base,tab:"preview"}),local.writeWorkspace({...base,tab:"lab"})]); assert.equal((await local.readWorkspace()).tab,"lab");
});
await test("Transaction abort retains last saved current project and library",async()=> {
  const before=await local.readWorkspace(), put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){const req=put.call(this,value,key);if(key==="current")this.transaction.abort();return req;};
  try { await assert.rejects(()=>local.saveLibraryWorkspace(base,{...base,tab:"quality"})); } finally { IDBObjectStore.prototype.put=put; }
  assert.deepEqual(await local.readWorkspace(),before); assert.equal((await local.listLibrary()).length,0);
});
await test("Separate tabs cannot silently overwrite a newer revision",async()=> {
  const other=await import(pathToFileURL(path.join(output,"local-store.mjs")).href+"?other-tab");
  await other.readWorkspace(); await local.writeWorkspace({...base,tab:"quality"});
  await assert.rejects(()=>other.writeWorkspace({...base,tab:"lab"}),/另一个标签页/);
  assert.equal((await local.readWorkspace()).tab,"quality");
  await other.readWorkspace();await other.writeWorkspace({...base,tab:"preview"});await local.readWorkspace();
});
await test("Library switching and GC preserve payloads still used by saved projects",async()=> {
  const next=s.restoreSnapshot({dataset:e.parseCSV("分类,数值\nA,8","next.csv")},e.profileDataset(e.parseCSV("分类,数值\nA,8","next.csv")));
  await local.saveLibraryWorkspace(base,next); await local.writeWorkspace(next);
  assert.equal((await local.readLibraryWorkspace(base.dataset.id)).dataset.rows.length,3);
  assert.equal((await local.readWorkspace()).dataset.name,"next.csv");
  await local.deleteLibraryWorkspace(base.dataset.id); assert.equal(await local.readLibraryWorkspace(base.dataset.id),null); assert.equal((await local.readWorkspace()).dataset.rows.length,1);
});
await test("Quota failures leave previous revision and payload intact",async()=> {
  const before=await local.readWorkspace(), put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){if(key==="current")throw new DOMException("Test quota exhausted","QuotaExceededError");return put.call(this,value,key);};
  try { await assert.rejects(()=>local.writeWorkspace(base),error=>error.name==="QuotaExceededError"); } finally { IDBObjectStore.prototype.put=put; }
  assert.deepEqual(await local.readWorkspace(),before);
});
await test("Payload allocation quota failures abort without partial metadata",async()=> {
  const before=await local.readWorkspace(), put=IDBObjectStore.prototype.put;
  const fresh=s.restoreSnapshot({dataset:{...base.dataset,id:"fresh-quota-payload"}},profile);
  IDBObjectStore.prototype.put=function(value,key){if(String(key).startsWith("data:"))throw new DOMException("Test payload quota","QuotaExceededError");return put.call(this,value,key);};
  try { await assert.rejects(()=>local.writeWorkspace(fresh),error=>error.name==="QuotaExceededError"); } finally { IDBObjectStore.prototype.put=put; }
  assert.deepEqual(await local.readWorkspace(),before);
});
await test("Missing payload blocks recovery rather than opening empty data",async()=> {
  const current=await raw("current"); await transaction("readwrite",store=>store.delete(current.datasetKey));
  await assert.rejects(()=>local.readWorkspace(),/不完整/);
});
console.log(`${passed} product workflow tests passed.`);
