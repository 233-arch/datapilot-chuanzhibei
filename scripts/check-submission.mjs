import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
const read = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
};
const checks = [];
const add = (id, status, detail) => checks.push({ id, status, detail });
const team = read("submission/team.json");
add(
  "team",
  team?.school &&
    team?.group &&
    team?.teamName &&
    Array.isArray(team.members) &&
    team.members.length >= 1 &&
    team.members.length <= 3 &&
    team.members.every((m) => typeof m === "string" && m.trim()) &&
    Array.isArray(team.advisors) &&
    team.advisors.length <= 2
    ? "pass"
    : "blocked",
  "需真实学校、组别、队名、同校1-3名队员、最多2名指导老师；程序只能检查格式，同校与资格由参赛者确认。",
);
const review = read("submission/review.json");
const repositoryProof = read("outputs/repository-access.json");
const localHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
add(
  "reviewRepository",
  review?.repositoryUrl &&
    repositoryProof?.format === "datapilot-repository-proof" &&
    repositoryProof.repositoryUrl === review.repositoryUrl &&
    repositoryProof.visibility === "public" &&
    repositoryProof.anonymousApi === true &&
    repositoryProof.anonymousGit === true &&
    repositoryProof.headCommit === localHead.stdout?.trim() &&
    repositoryProof.verifiedAt === review.repositoryAccessVerifiedAt
    ? "pass"
    : "blocked",
  "本项目选择GitHub公开评审；需匿名API、匿名Git、关键材料和当前提交一致的验证记录。仅填写URL与时间不能通过。",
);
const model = read("outputs/model-evaluation.json");
const modelSourceFingerprint = createHash("sha256")
  .update(readFileSync("lib/data-engine.ts"))
  .update(readFileSync("lib/agent.ts"))
  .update(readFileSync("scripts/eval-model.mjs"))
  .digest("hex");
add(
  "realModel",
  model?.sourceFingerprint === modelSourceFingerprint &&
    model?.status === "passed" &&
    model?.mode === "model" &&
    model?.passed === model?.total &&
    model.total >= 6
    ? "pass"
    : "blocked",
  "需运行 npm run eval:model 获得当前源码的真实服务固定题集证据；无密钥、演示或失败不记作通过。",
);
const intelligence = read("outputs/intelligence-evaluation.json");
const intelligenceHash = createHash("sha256");
for (const name of [
  "data-engine",
  "diagnostics",
  "workbench",
  "knowledge",
  "model-tool",
  "agent",
  "workflow-model",
  "knowledge-model",
])
  intelligenceHash.update(readFileSync("lib/" + name + ".ts"));
intelligenceHash.update(readFileSync("scripts/eval-intelligence.mjs"));
add(
  "intelligenceModel",
  intelligence?.format === "datapilot-intelligence-evaluation" &&
    intelligence?.sourceFingerprint === intelligenceHash.digest("hex") &&
    intelligence?.status === "passed" &&
    intelligence?.realModelCases === 9 &&
    intelligence?.passed === intelligence?.total &&
    intelligence?.total === 10
    ? "pass"
    : "blocked",
  "v0.6多步骤规划和知识问答需匹配当前源码的9项真实模型及1项本机检查；这是已宣称功能的项目验证，不是新增官方必交材料。",
);
add(
  "source",
  ["README.md", ".env.example", "package-lock.json", "docs/技术文档.md"].every(
    existsSync,
  )
    ? "pass"
    : "blocked",
  "说明、架构、启动、环境模板与锁定依赖。",
);
const pdf = "output/pdf/数问DataPilot_技术说明.pdf";
const pdfReview = read("outputs/pdf-review.json");
const pdfHash = existsSync(pdf)
  ? createHash("sha256").update(readFileSync(pdf)).digest("hex")
  : null;
add(
  "technicalPDF",
  pdfHash &&
    pdfReview?.sha256 === pdfHash &&
    pdfReview.pages >= 1 &&
    pdfReview.pages <= 30 &&
    pdfReview.visuallyReviewedAt
    ? "pass"
    : existsSync(pdf)
      ? "review"
      : "blocked",
  "PDF<=30页；需求、架构、AI选型/优化、核心实现、创新点、测试部署、展望须人工核对。检查记录必须匹配当前PDF内容指纹。",
);
const git = spawnSync("git", ["rev-list", "--count", "HEAD"], {
  encoding: "utf8",
});
add(
  "gitHistory",
  git.status === 0 && Number(git.stdout.trim()) >= 2 ? "pass" : "blocked",
  "保留真实开发历史；源码ZIP没有历史，另提供Git bundle迁移材料。",
);
if (review?.videoPath && existsSync(review.videoPath)) {
  const probe = spawnSync(
    process.env.DATAPILOT_FFPROBE || "ffprobe",
    [
      "-v",
      "quiet",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      path.resolve(review.videoPath),
    ],
    { encoding: "utf8" },
  );
  const metadata = probe.status === 0 ? JSON.parse(probe.stdout) : null;
  const video = metadata?.streams?.find((s) => s.codec_type === "video"),
    audio = metadata?.streams?.find((s) => s.codec_type === "audio"),
    duration = Number(metadata?.format?.duration);
  const passed =
    /\.mp4$/i.test(review.videoPath) &&
    video &&
    Math.min(video.width, video.height) >= 1080 &&
    duration >= 300 &&
    duration <= 480 &&
    audio &&
    review.videoNarrationVerifiedAt;
  add(
    "demoVideo",
    passed ? "pass" : "blocked",
    probe.error
      ? "ffprobe不可用，无法核对视频规格。"
      : "需MP4、5-8分钟、至少1080p、音轨；普通话与核心内容仍需人工观看确认。",
  );
} else
  add(
    "demoVideo",
    "blocked",
    "未找到实际演示视频。脚本、字幕和截图不等于已完成MP4。",
  );
const demoProof = read("outputs/public-demo-verification.json");
const demoVerified = review?.reviewDemoUrl &&
  demoProof?.format === "datapilot-public-demo-proof" &&
  demoProof.url === review.reviewDemoUrl &&
  demoProof.verifiedAt === review.reviewDemoAccessVerifiedAt &&
  demoProof.deployedCommit === localHead.stdout?.trim() &&
  demoProof.anonymousPage?.status === 200 &&
  demoProof.anonymousApiBlocked === true &&
  demoProof.requiresOwnApi === true &&
  demoProof.byok?.realModelChecked === true;
add(
  "onlineDemo",
  demoVerified
    ? "pass"
    : "optional",
  demoVerified
    ? "公开演示已通过匿名页面、静态资源及个人 API 实测；真实 AI 需访问者自备 API，未配置时可体验本机分析。单次验证不保证持续可用。"
    : "在线演示为可选加分项；需当前部署的匿名访问与个人 API 调用证据，私人链接或仅填写 URL 不代表评委已可访问。",
);
const checkedAt = new Date();
const checkedDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
}).format(checkedAt);
const report = {
  checkedAt: checkedAt.toISOString(),
  sourceCommit: localHead.stdout?.trim() || null,
  ruleCheckedOn: "2026-10-28",
  ruleUrl: "https://www.boxuegu.com/matchTrack/detail/?id=10037",
  ready: checks.every((c) => c.status === "pass" || c.status === "optional"),
  checks,
  notice:
    "自动检查仅整理证据，不能替代主办方资格、原创性和材料评审。报名、缴费及最终提交未由本脚本执行。",
};
mkdirSync("outputs", { recursive: true });
writeFileSync("outputs/submission-audit.json", JSON.stringify(report, null, 2));
writeFileSync(
  "outputs/提交检查结果.md",
  `# 提交检查结果\n\n检查日期：${checkedDate}（北京时间）\n\n当前结论：${report.ready ? "材料检查通过，仍需参赛者复核后提交" : "尚未满足直接提交条件"}\n\n|检查项|状态|说明|\n|---|---|---|\n${checks.map((c) => `|${c.id}|${c.status}|${c.detail}|`).join("\n")}\n\n${report.notice}\n`,
);
for (const c of checks)
  console.log(`${c.status.toUpperCase()} ${c.id}: ${c.detail}`);
console.log(report.ready ? "READY" : "NOT READY: 请按清单补齐材料。");
if (!report.ready) process.exitCode = 2;
