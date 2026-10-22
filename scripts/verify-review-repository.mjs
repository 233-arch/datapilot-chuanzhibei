import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function repositoryIdentity(value) {
  const url = new URL(value.trim());
  const path = url.pathname.replace(/\/$/, "").replace(/\.git$/, "");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(path)
  )
    throw new Error("请提供完整的 https://github.com/所有者/仓库 地址。");
  const [owner, name] = path.slice(1).split("/");
  return { owner, name, url: `https://github.com/${owner}/${name}` };
}
export function anonymousGitHead(url, branch) {
  const r = spawnSync(
    "git",
    [
      "-c",
      "credential.helper=",
      "-c",
      "core.askPass=",
      "-c",
      "http.extraHeader=",
      "ls-remote",
      "--exit-code",
      url,
      `refs/heads/${branch}`,
    ],
    {
      encoding: "utf8",
      timeout: 30000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
        GIT_ASKPASS: "",
      },
    },
  );
  if (r.status !== 0)
    throw new Error("未能匿名读取仓库Git分支，不能记为评审访问已通过。");
  return r.stdout.trim().split(/\s+/)[0];
}
export async function verifyPublicRepository(
  value,
  expectedSha,
  { fetcher = fetch, gitProbe = anonymousGitHead } = {},
) {
  const id = repositoryIdentity(value);
  if (!/^[a-f0-9]{40,64}$/.test(expectedSha))
    throw new Error("本地提交SHA不正确。");
  const endpoint = `https://api.github.com/repos/${id.owner}/${id.name}`;
  async function get(url) {
    const r = await fetcher(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "DataPilot-review-verification",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      throw new Error(
        `匿名访问失败（HTTP ${r.status}），请确认仓库公开且地址正确。`,
      );
    return r.json();
  }
  const repo = await get(endpoint);
  if (
    repo.private !== false ||
    repo.visibility !== "public" ||
    repo.archived ||
    repo.disabled
  )
    throw new Error("仓库必须公开、可用且未归档。");
  const branch = repo.default_branch;
  if (!branch || typeof branch !== "string")
    throw new Error("仓库尚无默认分支。");
  const commit = await get(`${endpoint}/commits/${encodeURIComponent(branch)}`);
  if (commit.sha !== expectedSha)
    throw new Error("远程默认分支与本地最终提交不一致，请完成推送后再检查。");
  const treeSha = commit.commit?.tree?.sha;
  if (!/^[a-f0-9]{40,64}$/.test(treeSha || ""))
    throw new Error("仓库文件树信息不完整。");
  const tree = await get(`${endpoint}/git/trees/${treeSha}?recursive=1`);
  if (tree.truncated || !Array.isArray(tree.tree))
    throw new Error("仓库文件列表不完整。");
  const paths = new Set(
    tree.tree.filter((f) => f.type === "blob").map((f) => f.path),
  );
  const required = [
    "README.md",
    ".env.example",
    "package-lock.json",
    "output/pdf/数问DataPilot_技术说明.pdf",
  ];
  if (required.some((p) => !paths.has(p)))
    throw new Error("评审仓库缺少README、环境模板、依赖锁或技术PDF。");
  if (
    [...paths].some(
      (p) =>
        /(?:^|\/)\.env(?:\.|$)|(?:^|\/)\.dev\.vars/.test(p) &&
        !/(?:example|sample|template)$/.test(p),
    )
  )
    throw new Error("仓库包含环境配置文件，请先处理，不能继续标记通过。");
  if ((await gitProbe(id.url, branch)) !== expectedSha)
    throw new Error("匿名Git读取的提交与本地不一致。");
  return {
    format: "datapilot-repository-proof",
    version: 1,
    repositoryUrl: id.url,
    visibility: "public",
    verifiedAt: new Date().toISOString(),
    headCommit: expectedSha,
    defaultBranch: branch,
    anonymousApi: true,
    anonymousGit: true,
    requiredFiles: required,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const configPath = "submission/review.json";
    const review = existsSync(configPath)
      ? JSON.parse(readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""))
      : {};
    const url = process.argv[2] || review.repositoryUrl;
    if (!url)
      throw new Error("尚未配置仓库地址；请先创建并推送GitHub公开仓库。");
    const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    if (head.status !== 0) throw new Error("无法读取本地提交。");
    const proof = await verifyPublicRepository(url, head.stdout.trim());
    mkdirSync("outputs", { recursive: true });
    mkdirSync("submission", { recursive: true });
    writeFileSync(
      "outputs/repository-access.json",
      JSON.stringify(proof, null, 2),
    );
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          ...review,
          repositoryUrl: proof.repositoryUrl,
          repositoryAccessVerifiedAt: proof.verifiedAt,
        },
        null,
        2,
      ),
    );
    console.log(
      `PASS public reviewer access: ${proof.repositoryUrl}\nCommit: ${proof.headCommit}`,
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : "仓库验证失败。");
    process.exitCode = 1;
  }
}
