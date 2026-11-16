// Run test-product-workflows.mjs first to compile the same source modules.
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import path from "node:path";
const load = name => import(pathToFileURL(path.resolve(`work/product-tests/${name}.mjs`)));
const [engine, snapshot, backup] = await Promise.all(["data-engine", "workspace-snapshot", "workspace-backup"].map(load));
const columns = ["日期", "地区", ...Array.from({ length: 78 }, (_,i) => `指标${i+1}`)];
const rows = Array.from({ length: 20000 }, (_,i) => Object.fromEntries(columns.map((name, j) => [name, j===0 ? `2026-${String(i%12+1).padStart(2,"0")}-01` : j===1 ? `地区${i%8}` : (i+j)%1000])));
const dataset = { id:"perf-fixture", name:"20000x80.json", source:"demo", createdAt:new Date().toISOString(), columns, rows };
const measurements = {};
async function measure(name, action) { const start=performance.now(); const value=await action(); measurements[name]=Math.round((performance.now()-start)*100)/100; return value; }
const profile=await measure("profile_ms",()=>engine.profileDataset(dataset));
const plan={...engine.defaultPlan(profile),groupBy:"地区",metric:"指标1",aggregate:"sum",limit:10};
const result=await measure("aggregate_ms",()=>engine.executePlan(dataset,profile,plan));
const state=snapshot.restoreSnapshot({dataset,plan},profile);
const encoded=await measure("backup_create_ms",()=>backup.createBackup(state));
await measure("backup_validate_restore_ms",()=>backup.inspectBackup(encoded));
const report={ timestamp:new Date().toISOString(), runtime:process.version, context:"Node 单次本机基线，非浏览器交互响应时间；受机器负载影响", rows:rows.length, columns:columns.length, backupBytes:Buffer.byteLength(encoded), measurements, total:result.points.reduce((sum,p)=>sum+p.value,0) };
mkdirSync("outputs/v0.7.0/product-workflows",{recursive:true});
writeFileSync("outputs/v0.7.0/product-workflows/performance.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
