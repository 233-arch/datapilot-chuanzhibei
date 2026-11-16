import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("work/navigation-tests");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "navigation.mjs"), transpileModule(readFileSync("lib/workspace-navigation.ts", "utf8"), { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.ES2022 } }).outputText);
const n = await import(pathToFileURL(path.join(out, "navigation.mjs")));
for (const page of n.workspacePages) {
  assert.equal(n.parseWorkspacePage(`#/${page.id}`), page.id);
  const state = n.stateFromPage(page.id);
  assert.equal(n.pageFromState(state.view, state.tab || "charts"), page.id);
}
console.log("PASS all nine deep links round-trip through shared workspace state");
for (const hash of ["", "#", "#/unknown", "#/charts?key=secret", "#/../../settings", "#/<script>", "#/Charts", "#/quality/more"]) assert.equal(n.parseWorkspacePage(hash), null);
console.log("PASS unsupported addresses and injected fragments are rejected");
for (const [source, next] of Object.entries(n.nextPages)) for (const id of next) {
  assert.notEqual(id, source);
  assert.ok(n.workspacePages.some(page => page.id === id));
}
assert.equal(new Set(n.workspacePages.map(p => p.id)).size, n.workspacePages.length);
console.log("PASS every next-step action targets an existing different page");
