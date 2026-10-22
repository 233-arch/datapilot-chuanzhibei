import assert from "node:assert/strict";
import {
  repositoryIdentity,
  verifyPublicRepository,
} from "./verify-review-repository.mjs";
const head = "a".repeat(40),
  tree = "b".repeat(40);
const required = [
  "README.md",
  ".env.example",
  "package-lock.json",
  "output/pdf/数问DataPilot_技术说明.pdf",
];
let count = 0;
async function test(name, fn) {
  await fn();
  console.log(`PASS ${name}`);
  count++;
}
function fake({
  privateRepo = false,
  commit = head,
  files = required,
  http = 200,
  git = head,
} = {}) {
  const calls = [];
  return {
    calls,
    options: {
      fetcher: async (url, options) => {
        calls.push({ url, options });
        let payload;
        if (url.endsWith("/commits/main"))
          payload = { sha: commit, commit: { tree: { sha: tree } } };
        else if (url.includes("/git/trees/"))
          payload = {
            truncated: false,
            tree: files.map((path) => ({ path, type: "blob" })),
          };
        else
          payload = {
            private: privateRepo,
            visibility: privateRepo ? "private" : "public",
            default_branch: "main",
            archived: false,
            disabled: false,
          };
        return Response.json(payload, { status: http });
      },
      gitProbe: async () => git,
    },
  };
}
await test("Normalize only GitHub HTTPS repository identities", () => {
  assert.equal(
    repositoryIdentity("https://github.com/owner/DataPilot.git/").url,
    "https://github.com/owner/DataPilot",
  );
});
await test("Reject credentials, query strings and alternate hosts before requests", async () => {
  for (const url of [
    "http://github.com/o/r",
    "https://github.com@evil.example/o/r",
    "https://token@github.com/o/r",
    "https://github.com/o/r?token=x",
    "https://github.com/o/r/issues",
  ]) {
    await assert.rejects(verifyPublicRepository(url, head));
  }
});
await test("Proof requires anonymous API, files and matching anonymous Git HEAD", async () => {
  const remote = fake(),
    proof = await verifyPublicRepository(
      "https://github.com/owner/DataPilot",
      head,
      remote.options,
    );
  assert.equal(proof.visibility, "public");
  assert.equal(proof.headCommit, head);
  assert.equal(proof.anonymousGit, true);
  assert.equal(remote.calls.length, 3);
  for (const c of remote.calls) {
    assert.ok(
      !Object.keys(c.options.headers).some(
        (h) => h.toLowerCase() === "authorization",
      ),
    );
    assert.equal(c.options.redirect, "error");
  }
});
await test("Private or HTTP-inaccessible repositories cannot pass", async () => {
  await assert.rejects(
    verifyPublicRepository(
      "https://github.com/o/r",
      head,
      fake({ privateRepo: true }).options,
    ),
    /公开/,
  );
  await assert.rejects(
    verifyPublicRepository(
      "https://github.com/o/r",
      head,
      fake({ http: 404 }).options,
    ),
    /HTTP 404/,
  );
});
await test("A pushed older commit cannot pass current-version verification", async () => {
  await assert.rejects(
    verifyPublicRepository(
      "https://github.com/o/r",
      head,
      fake({ commit: "c".repeat(40) }).options,
    ),
    /不一致/,
  );
});
await test("Missing review materials or exposed environment files cannot pass", async () => {
  await assert.rejects(
    verifyPublicRepository(
      "https://github.com/o/r",
      head,
      fake({ files: required.slice(0, 2) }).options,
    ),
    /缺少/,
  );
  await assert.rejects(
    verifyPublicRepository(
      "https://github.com/o/r",
      head,
      fake({ files: [...required, ".env.local"] }).options,
    ),
    /环境配置/,
  );
});
await test("API metadata alone cannot substitute for matching anonymous Git access", async () => {
  await assert.rejects(
    verifyPublicRepository(
      "https://github.com/o/r",
      head,
      fake({ git: "c".repeat(40) }).options,
    ),
    /匿名Git/,
  );
});
console.log(`\n${count} review repository checks passed.`);
