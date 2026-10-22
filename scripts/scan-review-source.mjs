import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
function git(args, options = {}) {
  const r = spawnSync("git", args, { maxBuffer: 64 * 1024 * 1024, ...options });
  if (r.status !== 0) throw new Error("无法读取Git历史，请在完整仓库执行。");
  return r.stdout;
}
const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
  ],
  ["model-api-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g],
  ["aws-access-key", /\bAKIA[A-Z0-9]{16}\b/g],
];
const findings = [];
let inspected = 0;
const binary =
  /\.(?:pdf|png|jpe?g|gif|webp|ico|woff2?|ttf|gz|zip|bundle|mp4)$/i;
function scan(bytes, file, object = "working-tree") {
  if (binary.test(file) || bytes.subarray(0, 8000).includes(0)) return;
  inspected++;
  const text = bytes.toString("utf8");
  for (const [kind, regex] of patterns) {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    if (match)
      findings.push({
        kind,
        file,
        object,
        line: text.slice(0, match.index).split("\n").length,
      });
  }
  if (
    /(?:^|\/)\.env(?:\.|$)|(?:^|\/)\.dev\.vars/.test(file) &&
    !/(?:example|sample|template)$/.test(file)
  )
    findings.push({ kind: "environment-file", file, object });
}
const objects = git(["rev-list", "--objects", "--all"])
  .toString("utf8")
  .trim()
  .split("\n")
  .map((line) => {
    const split = line.indexOf(" ");
    return {
      sha: split < 0 ? line : line.slice(0, split),
      file: split < 0 ? "" : line.slice(split + 1),
    };
  })
  .filter((o) => o.file && !binary.test(o.file));
const info = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
  input: objects.map((o) => o.sha).join("\n") + "\n",
})
  .toString("utf8")
  .trim()
  .split("\n");
const blobs = objects.filter((o, i) => info[i]?.endsWith(" blob"));
if (blobs.length) {
  const data = git(["cat-file", "--batch"], {
    input: blobs.map((o) => o.sha).join("\n") + "\n",
  });
  let offset = 0;
  for (const object of blobs) {
    const end = data.indexOf(10, offset);
    const size = Number(
      data.subarray(offset, end).toString("utf8").split(" ")[2],
    );
    if (!Number.isFinite(size)) throw new Error("Git对象读取失败。");
    scan(data.subarray(end + 1, end + 1 + size), object.file, object.sha);
    offset = end + 1 + size + 1;
  }
}
const files = git([
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
for (const file of files) if (existsSync(file)) scan(readFileSync(file), file);
mkdirSync("outputs", { recursive: true });
writeFileSync(
  "outputs/source-scan.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      status: findings.length ? "failed" : "passed",
      inspected,
      findings,
      limitations:
        "已知高置信凭据模式及环境文件检查，非全面保密或法律审查；不输出命中内容。",
    },
    null,
    2,
  ),
);
console.log(
  `${findings.length ? "FAIL" : "PASS"} source and Git history scan; inspected=${inspected}; findings=${findings.length}`,
);
if (findings.length) {
  for (const f of findings)
    console.log(`${f.kind}: ${f.file}:${f.line || 1} (${f.object})`);
  process.exitCode = 1;
}
