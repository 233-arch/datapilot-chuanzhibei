import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {transpileModule,ModuleKind,ScriptTarget} from "typescript";
import {pathToFileURL} from "node:url";
import path from "node:path";
const out=path.resolve("work/visitor-api-tests");mkdirSync(out,{recursive:true});
for(const name of ["visitor-credentials","model-config"]){
 const code=transpileModule(readFileSync(`lib/${name}.ts`,"utf8"),{compilerOptions:{module:ModuleKind.ES2022,target:ScriptTarget.ES2022}}).outputText.replace('"./visitor-credentials"','"./visitor-credentials.mjs"');
 writeFileSync(path.join(out,name+".mjs"),code);
}
const c=await import(pathToFileURL(path.join(out,"visitor-credentials.mjs"))),m=await import(pathToFileURL(path.join(out,"model-config.mjs")));
let passed=0;function test(name,run){run();passed++;console.log("PASS "+name);}
const request=(config)=>new Request("https://datapilot.example/api/analyze",{headers:c.credentialHeaders(config)});
const a={provider:"deepseek",key:"visitor-a-example-key",model:"deepseek-flash"};
const b={provider:"openai",key:"visitor-b-example-key",model:"test-model"};
test("deployment credentials never become a public fallback",()=>{
 const previous=process.env.DATA_MODEL_API_KEY;process.env.DATA_MODEL_API_KEY="deployment-owner-example-key";
 try{assert.deepEqual(m.modelConfig(),{});assert.deepEqual(m.modelConfig(request(null)),{});}finally{if(previous===undefined)delete process.env.DATA_MODEL_API_KEY;else process.env.DATA_MODEL_API_KEY=previous;}
});
test("two visitors remain isolated and anonymous requests stay empty",()=>{
 assert.equal(m.modelConfig(request(a)).key,a.key);assert.equal(m.modelConfig(request(b)).key,b.key);assert.deepEqual(m.modelConfig(request(null)),{});assert.equal(m.modelConfig(request(a)).key,a.key);
});
test("provider targets are fixed HTTPS origins",()=>{
 assert.equal(m.modelConfig(request(a)).url,"https://api.deepseek.com");assert.equal(m.modelConfig(request(b)).url,"https://api.openai.com/v1");
 for(const provider of ["https://localhost","http://169.254.169.254","__proto__","constructor"]){assert.throws(()=>c.validateVisitorModel({...a,provider}));}
});
test("invalid keys and model identifiers are rejected without echoing secrets",()=>{
 for(const change of [{key:"short"},{key:"example key"},{key:"example\r\nheader"},{model:"bad model"},{model:"x".repeat(101)}])assert.throws(()=>c.validateVisitorModel({...a,...change}));
 const secret="short";const r=m.requestModelConfig(new Request("https://datapilot.example",{headers:{"X-DataPilot-Api-Key":secret}}));assert.equal(r.response.status,400);assert.equal(r.response.headers.get("Cache-Control"),"no-store");
});
test("blank configuration never produces an authorization header",()=>assert.deepEqual(c.credentialHeaders(null),{}));
console.log(`Visitor API checks: ${passed} passed`);
