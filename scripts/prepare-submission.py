"""Package an explicit allowlist of review materials; never includes local keys."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile
import shutil

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True, encoding="utf-8").strip()

if git("status", "--porcelain", "--untracked-files=normal"):
    raise SystemExit("Save/push the final source before packaging review materials.")
commit = git("rev-parse", "HEAD")
source = OUT / "DataPilot-source.zip"
bundle = OUT / "DataPilot-history.bundle"
subprocess.run(["git", "archive", "--format=zip", f"--output={source}", "HEAD"], cwd=ROOT, check=True)
subprocess.run(["git", "bundle", "create", str(bundle), "--all"], cwd=ROOT, check=True)
subprocess.run(["git", "bundle", "verify", str(bundle)], cwd=ROOT, check=True, capture_output=True)
files = {
    source: "source/DataPilot-source.zip",
    bundle: "source/DataPilot-history.bundle",
    ROOT / "output/pdf/数问DataPilot_技术说明.pdf": "documents/技术说明.pdf",
}
for name in ["提交审查.md", "提交准备.md", "测试报告.md", "竞品调研.md", "开源与原创说明.md", "第三方依赖.md", "录制讲解稿.md", "录屏操作指南.md", "演示脚本.md", "v0.5验收.md", "v0.6验收.md", "v0.6.2验收.md", "v0.6.3验收.md", "v0.6.4验收.md", "在线演示与个人API.md", "用户试用任务.md"]:
    files[ROOT / "docs" / name] = "documents/" + name
for name in ["提交检查结果.md", "submission-audit.json", "public-demo-verification.json", "visitor-api-http.json", "import-size-verification.json", "model-evaluation.json", "intelligence-evaluation.json", "intelligence-http.json", "hosted-intelligence-verification.json", "hosted-model-verification.json", "model-secret-scan.json", "performance-evaluation.json", "explanation-evaluation.json", "pdf-review.json", "repository-access.json", "source-scan.json"]:
    candidate = OUT / name
    if candidate.exists():
        files[candidate] = "evidence/" + name
audit_path = OUT / "submission-audit.json"
audit = json.loads(audit_path.read_text(encoding="utf-8")) if audit_path.exists() else {}
remaining = [item["id"] for item in audit.get("checks", []) if item.get("status") in ["blocked", "review"]]
version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
assert audit.get("sourceCommit") == commit, "Run check-submission.mjs again for the frozen source."
manifest = {"version": version, "commit": commit, "isFinalSubmission": False, "videoIncluded": False, "remainingChecks": remaining, "notice": "这是审阅准备包。视频由参赛者另行准备；其余未完成项以当前检查为准。", "files": []}
archive = OUT / "DataPilot-review-preparation.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for src, dest in files.items():
        data = src.read_bytes()
        z.writestr(dest, data)
        manifest["files"].append({"path": dest, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    z.writestr("MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    z.writestr("请先阅读.txt", "本包用于审阅准备，不能当作已满足所有条件的最终提交。\n请先查看 documents/提交审查.md 与 evidence/提交检查结果.md。\n源码ZIP不含历史；Git bundle保留真实提交。\n实际视频尚未录制，模型无密钥时不会记为通过。\n")
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert not any(".env.local" in name or "team.json" in name for name in z.namelist())
print(f"Created review preparation archive; source commit {commit}; entries={len(files)+2}")

# A separate, clearly numbered handoff contains only the intended submission
# documents, source/history, and representative verification evidence.
handoff = OUT / "疯狂星期四_DataPilot_提交材料_不含视频"
handoff.mkdir(exist_ok=True)
selected = {
    ROOT / "output/pdf/数问DataPilot_技术说明.pdf": "01_技术文档/疯狂星期四_数问DataPilot_技术说明.pdf",
    source: "02_源码与历史/DataPilot-source.zip",
    bundle: "02_源码与历史/DataPilot-history.bundle",
    ROOT / "docs/技术文档.md": "04_参考资料/技术文档_可编辑.md",
}
for name in ["第三方依赖.md", "开源与原创说明.md", "录制讲解稿.md", "录屏操作指南.md", "演示脚本.md", "v0.6.2验收.md", "v0.6.3验收.md", "v0.6.4验收.md"]:
    selected[ROOT / "docs" / name] = "04_参考资料/" + name
for name in ["v6-2-readable-desktop.png", "v6-2-readable-mobile.png", "v6-3-quality-fixed.png", "v6-3-api-failure-fixed.png", "v6-3-quality-mobile.png", "v6-4-import-25mb.png", "v6-4-large-csv.png", "v6-4-large-xlsx.png", "v6-4-oversize-rejected.png"]:
    selected[ROOT / "docs/screenshots" / name] = "04_参考资料/screenshots/" + name
for name in ["innovation.csv", "validation.csv", "period-comparison.xlsx", "业务口径说明.md"]:
    selected[ROOT / "docs/samples" / name] = "04_参考资料/演示样本/" + name
for name in ["提交检查结果.md", "submission-audit.json", "model-evaluation.json", "intelligence-evaluation.json", "import-size-verification.json", "pdf-review.json", "repository-access.json", "source-scan.json"]:
    if (OUT / name).exists():
        selected[OUT / name] = "05_验证记录/" + name
for src, dest in selected.items():
    target = handoff / dest
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, target)

team = json.loads((ROOT / "submission/team.json").read_text(encoding="utf-8"))
review = json.loads((ROOT / "submission/review.json").read_text(encoding="utf-8"))
pdf_review = json.loads((OUT / "pdf-review.json").read_text(encoding="utf-8"))
def field(value):
    return value.strip() if isinstance(value, str) and value.strip() else "待补充"

members = "、".join(team.get("members") or []) or "待补充"
details = f"""作品名称：数问 DataPilot
队伍名称：{field(team.get('teamName'))}
赛道：AI WEB 网页开发挑战赛
选题方向：AI 数据分析与可视化
学校：{field(team.get('school'))}
参赛组别：{field(team.get('group'))}
队员姓名：{members}
队员分工：待补充
指导老师：{'、'.join(team.get('advisors') or []) or '未提供；如无指导老师，填写无'}

代码仓库：{review.get('repositoryUrl', '')}
源码版本：v{version}
冻结提交：{commit}

作品简介：
数问DataPilot面向课程实验与小规模表格分析，支持Excel/CSV导入、质量检查、自然语言提问、交互图表、业务诊断及报告导出。大模型把问题转换成受限分析计划，浏览器使用真实数据计算，并展示字段、筛选、参与记录和来源，便于核对与复现。系统还提供多步骤分析、带原文引用的业务知识问答、异常检测、情景推演及同数据配置迁移。

AI方案与创新摘要：
1. 结构化工具调用配合字段白名单与计划校验，模型提出计划，本机计算数值，不执行模型任意代码。
2. 业务文档在本机检索，回答引用原文；规划与导读共享可核对的统计证据。
3. 来源联动、异常核查、条件模拟、洞察比较和配置指纹支持课程探索与口径复现。
4. API由访客自行配置，密钥仅在本页内存中使用，不提供部署者共享密钥。

技术文档：选择01_技术文档目录中的PDF，{pdf_review['pages']}页。
演示视频：由你另行准备。MP4，5-8分钟，不低于1080p，普通话讲解，覆盖项目介绍、核心功能和AI亮点。
在线演示（可选）：{review.get('reviewDemoUrl', '')}
访问说明：该托管地址存在部分网络Cloudflare 403反馈，不保证大陆可达。未配置API时可体验本机分析；真实AI需访客个人API与额度。可选链接不能替代源码、PDF和视频。

官方赛道：https://www.boxuegu.com/matchTrack/detail/?id=10037
最终字段名称、文件大小与命名要求，以你登录的实际提交入口为准。
"""
(handoff / "03_官网填写").mkdir(exist_ok=True)
(handoff / "03_官网填写/官网填写信息.txt").write_text(details, encoding="utf-8")
(handoff / "03_官网填写/团队信息.json").write_text(json.dumps(team, ensure_ascii=False, indent=2), encoding="utf-8")
# Remove only an untouched legacy generated file, leaving any user edits intact.
legacy = handoff / "03_官网填写/团队信息待补充.json"
previous_manifest = handoff / "MANIFEST.json"
if legacy.exists() and previous_manifest.exists():
    previous_files = json.loads(previous_manifest.read_text(encoding="utf-8")).get("files", [])
    recorded = next((item for item in previous_files if item["path"] == legacy.relative_to(handoff).as_posix()), None)
    if recorded and recorded["sha256"] == hashlib.sha256(legacy.read_bytes()).hexdigest():
        legacy.unlink()
readme = f"""数问DataPilot - 疯狂星期四 - 提交材料（不含视频）
版本：v{version}
冻结提交：{commit}

正式提交时，通常填写02中的公开仓库地址，上传01中的技术PDF，再上传你录制的MP4；不必把整个准备包当作官网要求的单个附件。
02中的源码ZIP用于查看代码，Git bundle保留完整真实开发历史。仓库地址、作品简介及团队字段整理在03。
04是可编辑技术文档、版权依赖说明、录制参考和合成演示样本；05是项目检查与模型评测证据。

视频按你的要求留空，本包不含MP4。当前缺失的非视频检查项：{'、'.join(x for x in remaining if x != 'demoVideo') or '无'}。
团队资料已填写：{field(team.get('school'))}，{field(team.get('group'))}，{members}，指导老师{'、'.join(team.get('advisors') or []) or '无'}。成员实际分工待参赛者确认；提交前与README、技术文档及官网报名记录核对一致，再冻结最终版本。
检查结果不是主办方认证；本包未执行报名、缴费或官网最终提交。
"""
(handoff / "00_请先阅读.txt").write_text(readme, encoding="utf-8")
handoff_manifest = {key: value for key, value in manifest.items() if key != "files"}
handoff_manifest["nonVideoRemainingChecks"] = [x for x in remaining if x != "demoVideo"]
handoff_manifest["files"] = []
handoff_paths = sorted(set(selected.values()) | {
    "03_官网填写/官网填写信息.txt", "03_官网填写/团队信息.json", "00_请先阅读.txt"
})
for dest in handoff_paths:
    src = handoff / dest
    data = src.read_bytes()
    handoff_manifest["files"].append({"path": src.relative_to(handoff).as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
(handoff / "MANIFEST.json").write_text(json.dumps(handoff_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
handoff_zip = OUT / (handoff.name + ".zip")
with zipfile.ZipFile(handoff_zip, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for dest in handoff_paths + ["MANIFEST.json"]:
        z.write(handoff / dest, dest)
with zipfile.ZipFile(handoff_zip) as z:
    assert z.testzip() is None
    assert not any(n.lower().endswith(".mp4") or ".env.local" in n for n in z.namelist())
print(f"Created non-video handoff: {handoff_zip}")
