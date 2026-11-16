"""Package the verified current working tree, not an older Git HEAD.

Run after build-review-documents.py, document render/QA and current checks.
Does not commit, push, deploy, upload or include any video.
"""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
SPECS = json.loads((ROOT / "docs/review-materials-v0.7.0.json").read_text(encoding="utf-8"))
assert VERSION == SPECS["version"]
NAME = f"疯狂星期四_DataPilot_v{VERSION}_提交材料_不含视频"
DEST = OUT / NAME
DOCS = OUT / "v0.7.0/submission-documents"
QA = json.loads((DOCS / "document-qa.json").read_text(encoding="utf-8"))
assert QA["status"] == "passed" and QA["visualReviewCompleted"]
def digest(data): return hashlib.sha256(data).hexdigest()
assert QA["contentSha256"] == digest((ROOT / "docs/review-materials-v0.7.0.json").read_bytes())
def git(*args): return subprocess.check_output(["git", *args], cwd=ROOT)
def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
def copy(src, relative):
    dst = DEST / relative
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return dst

for item in QA["files"]:
    assert digest((ROOT / item["path"]).read_bytes()) == item["sha256"]
scan = json.loads((OUT / "source-scan.json").read_text(encoding="utf-8"))
assert scan["status"] == "passed"
tests = (ROOT / "work/submission-20261116-tests.log").read_text(encoding="utf-8-sig")
assert len(re.findall(r"^PASS ", tests, re.M)) == 211 and not re.search(r"^FAIL ", tests, re.M)
base = git("rev-parse", "HEAD").decode().strip()
names = sorted(set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode("utf-8").split("\0")) - {""})
excluded_roots = {"outputs", "output", "work", "tmp", "node_modules", "dist", ".git", ".next", ".vinext", ".wrangler", ".sites-runtime", ".openai"}
source_files = []
for name in names:
    path = ROOT / name
    parts = Path(name).parts
    if parts[0] in excluded_roots or not path.is_file():
        continue
    if path.name.startswith(".env") and path.name != ".env.example":
        raise ValueError("Environment file is not allowed")
    if path.name.startswith(".dev.vars") or path.name in {"team.json", "review.json"} or path.suffix.lower() in {".pem", ".key", ".mp4", ".bundle", ".zip"}:
        raise ValueError(f"Unexpected private/generated file: {name}")
    if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
        raise ValueError(f"Unexpected source path: {name}")
    source_files.append((name, path.read_bytes()))
required = {"app/product-patterns.css", "components/exploration/analysis-collection.tsx", "lib/workspace-backup.ts", "docs/技术文档.md", "package-lock.json", ".env.example"}
assert required <= {name for name, _ in source_files}
source_manifest = {"version": VERSION, "snapshotDate": SPECS["date"], "snapshotType": "current-working-tree", "baseGitCommit": base,
                   "uncommittedChangesIncluded": True, "files": [{"path": n, "bytes": len(b), "sha256": digest(b)} for n, b in source_files]}
source_manifest["sourceFingerprint"] = digest("\n".join(f"{f['path']}\0{f['sha256']}" for f in source_manifest["files"]).encode())
source = OUT / "DataPilot-source.zip"
with zipfile.ZipFile(source, "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in source_files:
        z.writestr(name, data)
    z.writestr("SOURCE_MANIFEST.json", json.dumps(source_manifest, ensure_ascii=False, indent=2))
with zipfile.ZipFile(source) as z:
    assert z.testzip() is None
    for f in source_manifest["files"]:
        assert digest(z.read(f["path"])) == f["sha256"]
bundle = OUT / "DataPilot-history.bundle"
subprocess.run(["git", "bundle", "create", str(bundle), "--all"], cwd=ROOT, check=True)
subprocess.run(["git", "bundle", "verify", str(bundle)], cwd=ROOT, check=True, capture_output=True)

DEST.mkdir(parents=True, exist_ok=True)
categories = {"product": "01_产品介绍", "technical": "02_技术文档", "speech": "05_演讲与录制"}
for spec in SPECS["documents"]:
    for ext in [".docx", ".pdf"]:
        file = DOCS / (spec["filename"] + ext)
        copy(file, categories[spec["key"]] + "/" + file.name)
copy(source, "03_源码与历史/DataPilot-source.zip")
copy(bundle, "03_源码与历史/DataPilot-history.bundle")
write_json(DEST / "03_源码与历史/SOURCE_MANIFEST.json", source_manifest)
for name in ["技术文档.md", "产品介绍.md", "演讲与录制方案.md", "2026-11-16提交材料更新.md", "第三方依赖.md", "开源与原创说明.md", "2026-11-16竞品参考与界面改进.md", "2026-11-16产品工作流完善.md"]:
    copy(ROOT / "docs" / name, "06_参考与验证/" + name)
for name in ["innovation.csv", "validation.csv", "period-comparison.xlsx", "业务口径说明.md"]:
    copy(ROOT / "docs/samples" / name, "07_演示样本/" + name)
for name in ["v7-home.png", "v7-charts.png"]:
    copy(ROOT / "docs/screenshots" / name, "06_参考与验证/screenshots/" + name)
for name in ["submission-20261116-tests.log", "submission-20261116-build.log", "submission-20261116-typecheck.log"]:
    copy(ROOT / "work" / name, "06_参考与验证/" + name)
copy(DOCS / "document-qa.json", "06_参考与验证/document-qa.json")
copy(OUT / "source-scan.json", "06_参考与验证/source-scan.json")
for name in ["model-evaluation.json", "intelligence-evaluation.json"]:
    if (OUT / name).exists():
        copy(OUT / name, "06_参考与验证/历史模型评测_非本轮复测/" + name)
team = json.loads((ROOT / "submission/team.json").read_text(encoding="utf-8"))
write_json(DEST / "04_提交信息/团队信息.json", team)
(DEST / "04_提交信息/填写参考.txt").write_text(f"""作品：数问 DataPilot
队伍：疯狂星期四
学校：河南农业大学
组别：B组
队员：刘宗柯、陈世航、刘兴海
指导老师：唐琦
版本：v{VERSION}，{SPECS['date']} 本地源码快照
赛道：AI WEB 网页开发挑战赛
项目简介：面向课程实验与小规模表格分析，提供文件导入、数据质量检查、本地及模型辅助分析、交互图表、来源追溯和报告交付。大模型输出受限计划，统计数值由浏览器引擎计算。
此前发表或获奖：无。
基于他人或现成项目继续开发：否。使用通用开源依赖，许可说明见附件。
代码仓库：https://github.com/233-arch/datapilot-chuanzhibei
版本说明：该远端本轮未同步。当前评审版本以本包源码快照为准。
视频：由团队录制，本包不含 MP4。
网盘链接：本包尚未替换旧分享文件，需要上传本次 ZIP 后使用对应链接。
""", encoding="utf-8")
(DEST / "00_请先阅读.txt").write_text(f"""数问 DataPilot v{VERSION} 本地提交材料
整理日期：{SPECS['date']}

01 产品介绍：七项内容说明，DOCX 和 PDF。
02 技术文档：当前架构、AI、数据处理与复现步骤，DOCX 和 PDF。
03 源码与历史：运行最新版请解压 DataPilot-source.zip；Git bundle 仅保存已有提交历史。
04 提交信息：团队资料和填写参考。
05 演讲与录制：约七分钟时间轴、台词、对应操作、准备和备用处理。
06 参考与验证：当前截图、可编辑正文、自动检查、文档检查与历史模型证据。
07 演示样本：合成数据及口径说明。

实际 MP4 按团队安排另行录制。材料已经本地同步，尚未同步原线上站点、GitHub 远端或旧网盘。
顶层 MANIFEST.json 校验本包文件；源码 SOURCE_MANIFEST.json 校验逐文件内容并说明 Git 基线。
这个目录不是官网已提交的凭证；请按实际提交入口选择需要上传的文件。
""", encoding="utf-8")
paths = sorted(p for p in DEST.rglob("*") if p.is_file() and p.name != "MANIFEST.json")
manifest = {"version": VERSION, "date": SPECS["date"], "videoIncluded": False, "sourceFingerprint": source_manifest["sourceFingerprint"],
            "remoteUpdated": False, "files": [{"path": p.relative_to(DEST).as_posix(), "bytes": p.stat().st_size, "sha256": digest(p.read_bytes())} for p in paths]}
write_json(DEST / "MANIFEST.json", manifest)
archive = OUT / (NAME + ".zip")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for p in [*paths, DEST / "MANIFEST.json"]:
        z.write(p, p.relative_to(DEST).as_posix())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for f in manifest["files"]:
        assert digest(z.read(f["path"])) == f["sha256"]
    assert not any(n.endswith(".mp4") or ".env.local" in n for n in z.namelist())
shutil.copy2(archive, OUT / "疯狂星期四_DataPilot_提交材料_不含视频.zip")
print(json.dumps({"archive": str(archive), "files": len(manifest["files"]), "sourceFiles": len(source_files), "bytes": archive.stat().st_size, "sourceFingerprint": source_manifest["sourceFingerprint"]}, ensure_ascii=False))
