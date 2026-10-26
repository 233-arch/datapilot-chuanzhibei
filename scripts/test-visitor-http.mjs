import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { verifyIntelligenceHttp } from "./test-intelligence-http.mjs";
const base = new URL(process.env.DATAPILOT_TEST_URL || "http://127.0.0.1:5173").origin;
const request = (route, init = {}) => fetch(base + route, { redirect: "manual", signal: AbortSignal.timeout(55000), ...init });
const page = await request("/");
assert.equal(page.status, 200);
const html = await page.text();assert.ok(html.includes("DataPilot"));
const assets = [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^\"]*)?)"/g)].map(m => m[1]).filter(p => new URL(p,base).origin === base).slice(0,3);
assert.ok(assets.length);
for (const asset of assets) {const r=await request(new URL(asset,base).pathname);assert.equal(r.status,200);assert.ok(!r.headers.get("content-type")?.includes("text/html"));}
const status=await request("/api/analyze"), state=await status.json();
assert.equal(status.status,200);assert.equal(state.mode,"demo");assert.equal(state.requiresOwnApi,true);assert.equal(state.model,null);
const blocked=[];
for(const route of ["/api/workflow","/api/knowledge","/api/explain","/api/model-health"]){
 const r=await request(route,{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:"{}"});assert.equal(r.status,409);blocked.push(route);
}
const malformed=await request("/api/model-health",{method:"POST",headers:{"X-DataPilot-Api-Key":"example-visitor-key","X-DataPilot-Provider":"https://127.0.0.1",Origin:base}});
assert.equal(malformed.status,400);assert.ok(!(await malformed.text()).includes("example-visitor-key"));
let byok=null;
if(process.argv.includes("--with-api")){
 if(existsSync(".env.local"))process.loadEnvFile(".env.local");
 const key=process.env.DATA_MODEL_API_KEY?.trim();assert.ok(key,"Local verification key is required");
 const credentials={"X-DataPilot-Api-Key":key,"X-DataPilot-Provider":"deepseek","X-DataPilot-Model":process.env.DATA_MODEL_NAME||"deepseek-flash"};
 const health=await request("/api/model-health",{method:"POST",headers:{...credentials,Origin:base}});
 assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
 byok=await verifyIntelligenceHttp(base,credentials);assert.equal(byok.realModelChecked,true);
}
const result={format:"datapilot-public-demo-proof",verifiedAt:new Date().toISOString(),url:base,deployedCommit:process.env.DATAPILOT_DEPLOYED_COMMIT||null,anonymousPage:{status:page.status,assetsChecked:assets.length},requiresOwnApi:true,anonymousApiBlocked:true,blockedRoutes:blocked,invalidProviderRejected:true,byok,limits:["单次检查，不代表评审期间持续可用；实际 AI 需访问者自备 API 与额度。"]};
mkdirSync("outputs",{recursive:true});
const output=base==="https://datapilot-chuanzhibei.silky-bear-7395.chatgpt.site"?"outputs/public-demo-verification.json":"outputs/visitor-api-http.json";
writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
