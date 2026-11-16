import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const target=path.resolve("work/snapshot-tests"); mkdirSync(target,{recursive:true});
const compiled=new Set();
function compile(name) {
  if(compiled.has(name))return; compiled.add(name);
  const result=transpileModule(readFileSync(`lib/${name}.ts`,"utf8"),{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ES2022}}).outputText.replace(/from (["'])\.\/([^"']+)\1/g,(_,q,dependency)=>{compile(dependency);return `from "./${dependency}.mjs"`;});
  writeFileSync(path.join(target,`${name}.mjs`),result);
}
compile("workspace-snapshot");
const s=await import(pathToFileURL(path.join(target,"workspace-snapshot.mjs")));
const e=await import(pathToFileURL(path.join(target,"data-engine.mjs")));
const dataset=e.parseCSV("地区,金额\n华北,10\n华南,20\n华北,30","snapshot-test.csv"), profile=e.profileDataset(dataset);
let count=0; function test(name,fn){fn();count++;console.log(`PASS ${name}`);}
test("Legacy workspaces without optional fields remain usable",()=>{
 const restored=s.restoreSnapshot({dataset},profile);
 assert.equal(restored.dataset.id,dataset.id);assert.deepEqual(restored.filters,[]);assert.deepEqual(restored.entries,[]);assert.equal(restored.tools.datasetId,dataset.id);
});
test("Stored datasets reject missing cells, duplicate columns, nonfinite numbers and oversized tables",()=>{
 for(const bad of [{...dataset,rows:[{}]},{...dataset,columns:["金额","金额"]},{...dataset,rows:[{地区:"华北",金额:Infinity}]},{...dataset,rows:Array(20001).fill(dataset.rows[0])}])assert.throws(()=>s.validateStoredDataset(bad));
 assert.equal(s.validateStoredDataset(dataset),dataset);
});
test("Saved filters, dictionary, pins and plan survive a round trip",()=>{
 const original=s.restoreSnapshot({dataset},profile);
 original.filters=[{field:"地区",operator:"eq",value:"华北"}];
 original.dictionary={金额:{description:"实际金额",aliases:["收入"],unit:"元"}};
 original.pins=[{id:"pin1",name:"对比",note:"测试说明",createdAt:new Date().toISOString(),plan:original.plan}];
 const restored=s.restoreSnapshot(structuredClone(original),profile);
 assert.deepEqual(restored.filters,original.filters);assert.deepEqual(restored.pins,original.pins);assert.deepEqual(restored.dictionary,original.dictionary);assert.deepEqual(JSON.parse(JSON.stringify(restored.plan)),original.plan);
});
test("Analysis history is recomputed instead of trusting stale results",()=>{
 const base=s.restoreSnapshot({dataset},profile);
 const restored=s.restoreSnapshot({...base,entries:[{id:"e1",question:"金额",plan:base.plan,result:{points:[{name:"fake",value:999999}]},mode:"demo",retrieved:[]}]},profile);
 assert.deepEqual(restored.entries[0].result,e.executePlan(dataset,profile,base.plan));
});
test("Invalid plans and fields cannot leak between datasets",()=>{
 const restored=s.restoreSnapshot({dataset,plan:{metric:"不存在"},filters:[{field:"不存在",operator:"eq",value:"x"}],pins:[{plan:{metric:"不存在"}}],entries:[{plan:{metric:"不存在"}}]},profile);
 assert.deepEqual(restored.filters,[]);assert.deepEqual(restored.pins,[]);assert.deepEqual(restored.entries,[]);assert.equal(restored.plan.metric,e.defaultPlan(profile).metric);
});
test("Rules stay with their dataset and foreign tools are discarded",()=>{
 const base=s.restoreSnapshot({dataset},profile);
 base.tools.rules=[{id:"rule1",name:"金额非空",field:"金额",kind:"required"}];
 const restored=s.restoreSnapshot(base,profile);assert.equal(restored.tools.rules.length,1);
 const foreign=s.restoreSnapshot({...base,tools:{...base.tools,datasetId:"other"}},profile);assert.equal(foreign.tools.rules.length,0);
});
test("Library metadata reflects saved work without including row values",()=>{
 const base=s.restoreSnapshot({dataset},profile), item=s.libraryItem(base);
 assert.equal(item.rows,3);assert.equal(item.columns,2);assert.equal(item.id,dataset.id);assert.equal(item.analyses,0);assert.equal('dataset' in item,false);
});
test("Unknown top-level fields including API credentials are excluded from copies",()=>{
 const value={...s.restoreSnapshot({dataset},profile),apiKey:"test-not-a-secret",visitorModel:{apiKey:"test"},extra:"unknown"};
 const saved=s.snapshotFields(value);assert.equal('apiKey' in saved,false);assert.equal('visitorModel' in saved,false);assert.equal('extra' in saved,false);
});
test("A full library refuses new datasets without evicting an existing copy",()=>{
 const item=s.libraryItem(s.restoreSnapshot({dataset},profile));
 const full=Array.from({length:s.LIBRARY_LIMIT},(_,i)=>({...item,id:`copy-${i}`})), before=structuredClone(full);
 assert.throws(()=>s.updateLibraryIndex(full,{...item,id:"new"}),/已满/); assert.deepEqual(full,before);
 const updated=s.updateLibraryIndex(full,{...full[0],analyses:5});assert.equal(updated.length,s.LIBRARY_LIMIT);assert.equal(updated[0].analyses,5);
});
test("Same filenames stay independent and updating a copy does not duplicate it",()=>{
 const item=s.libraryItem(s.restoreSnapshot({dataset},profile));
 const items=s.updateLibraryIndex([{...item,id:"first"}],{...item,id:"second"});assert.equal(items.length,2);
 const updated=s.updateLibraryIndex(items,{...item,id:"first",pins:2});assert.equal(updated.length,2);assert.equal(updated[0].pins,2);assert.equal(items[1].pins,0);
});
console.log(`${count} workspace snapshot tests passed.`);
