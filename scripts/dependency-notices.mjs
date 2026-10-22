import { readFileSync, writeFileSync, existsSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const names = Object.keys({
  ...pkg.dependencies,
  ...pkg.devDependencies,
}).sort();
const rows = names.map((name) => {
  const p = `node_modules/${name}/package.json`;
  if (!existsSync(p)) return `|${name}|未安装|待核对|`;
  const meta = JSON.parse(readFileSync(p, "utf8"));
  const license =
    typeof meta.license === "string" ? meta.license : "见包内LICENSE";
  return `|${name}|${meta.version}|${license.replace(/\|/g, "/")}|`;
});
writeFileSync(
  "docs/第三方依赖.md",
  `# 直接依赖与许可证\n\n生成于2026-10-22。版本来自本机安装包，依赖树以package-lock.json为准。分发时仍须保留各包要求的版权与LICENSE声明。\n\n|包|版本|声明许可证|\n|---|---|---|\n${rows.join("\n")}\n`,
);
console.log(`记录 ${rows.length} 项直接依赖。`);
