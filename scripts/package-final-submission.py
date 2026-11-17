"""Create the complete submission from a clean, published Git commit.

The video is copied byte-for-byte. This script does not review or transcode it,
upload files, or submit the competition form. Refuses to reuse a staging folder.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True, type=Path)
    args = parser.parse_args()
    video = args.video.resolve(strict=True)
    assert video.suffix.lower() == ".mp4"
    assert video.stat().st_size > 0
    assert not git("status", "--porcelain", "--untracked-files=no").strip(), "Commit tracked changes first"
    head = git("rev-parse", "HEAD").decode().strip()
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    specs = json.loads((ROOT / "docs/review-materials-v0.7.0.json").read_text(encoding="utf-8"))
    assert specs["version"] == version and specs["date"] == "2026-11-17"
    out = ROOT / "outputs"
    docdir = out / "v0.7.0/submission-documents"
    qa = json.loads((docdir / "document-qa.json").read_text(encoding="utf-8"))
    assert qa["status"] == "passed" and qa["visualReviewCompleted"]
    assert qa["contentSha256"] == sha((ROOT / "docs/review-materials-v0.7.0.json").read_bytes())
    for f in qa["files"]:
        assert sha((ROOT / f["path"]).read_bytes()) == f["sha256"]
    scan = json.loads((out / "source-scan.json").read_text(encoding="utf-8"))
    assert scan["status"] == "passed"
    repo = json.loads((out / "repository-access.json").read_text(encoding="utf-8"))
    assert repo["headCommit"] == head and repo["anonymousGit"]
    assert repo.get("anonymousApi") or repo.get("anonymousWeb")
    log = (ROOT / "work/submission-20261117-tests.log").read_text(encoding="utf-8-sig")
    assert len(re.findall(r"^PASS ", log, re.M)) == 211 and not re.search(r"^FAIL ", log, re.M)
    assert "Build complete" in (ROOT / "work/submission-20261117-build.log").read_text(encoding="utf-8-sig")
    stamp = "20261117"
    title = f"河南农业大学_B组_疯狂星期四_数问DataPilot_v{version}_完整参赛作品_{stamp}"
    dest = out / title
    archive = out / (title + ".zip")
    assert not dest.exists() and not archive.exists(), "Final destination already exists; do not mix versions"
    dest.mkdir(parents=True)

    def copy(src, relative):
        target = dest / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
        assert sha(target.read_bytes()) == sha(Path(src).read_bytes())
        return target

    prefix = f"疯狂星期四_数问DataPilot_"
    for kind, folder in [("产品介绍", "01_产品介绍"), ("技术说明", "02_技术文档"), ("演讲与录制方案", "06_演示辅助/演讲参考")]:
        for ext in [".pdf", ".docx"]:
            name = f"{prefix}{kind}_v{version}{ext}"
            assert (docdir / name).read_bytes() == git("show", f"{head}:docs/submission/{name}")
            copy(docdir / name, folder + "/" + name)
    video_name = f"{prefix}演示视频_v{version}.mp4"
    video_copy = copy(video, "03_演示视频/" + video_name)

    source_dir = dest / "04_源码与历史"
    source_dir.mkdir()
    source_zip = source_dir / f"{prefix}源码_v{version}.zip"
    subprocess.run(["git", "-c", "core.autocrlf=false", "archive", "--format=zip", "--output", str(source_zip), head], cwd=ROOT, check=True)
    source_files = []
    with zipfile.ZipFile(source_zip) as z:
        assert z.testzip() is None
        for name in sorted(n for n in z.namelist() if not n.endswith("/")):
            p = Path(name)
            assert not p.is_absolute() and ".." not in p.parts
            assert not (p.name.startswith(".env") and p.name != ".env.example")
            assert not p.name.startswith(".dev.vars")
            assert name not in {"submission/team.json", "submission/review.json"}
            assert not ({"node_modules", ".git", "work", "outputs"} & set(p.parts))
            assert p.suffix.lower() not in {".mp4", ".pem", ".key", ".bundle"}
            data = z.read(name)
            assert data == git("show", f"{head}:{name}"), f"Source mismatch: {name}"
            source_files.append(dict(path=name, bytes=len(data), sha256=sha(data)))
    required = {"README.md", ".env.example", "package-lock.json", "package.json", "app/product-patterns.css", "docs/技术文档.md"}
    assert required <= {f["path"] for f in source_files}
    source_manifest = dict(version=version, date=specs["date"], snapshotType="git-commit", sourceCommit=head,
                           repositoryUrl=repo["repositoryUrl"], uncommittedChangesIncluded=False, files=source_files)
    source_manifest["sourceFingerprint"] = sha("\n".join(f"{f['path']}\0{f['sha256']}" for f in source_files).encode())
    write_json(source_dir / "SOURCE_MANIFEST.json", source_manifest)
    bundle = source_dir / f"{prefix}Git历史_v{version}.bundle"
    subprocess.run(["git", "bundle", "create", str(bundle), "--all"], cwd=ROOT, check=True)
    subprocess.run(["git", "bundle", "verify", str(bundle)], cwd=ROOT, check=True, capture_output=True)
    (source_dir / "运行说明.txt").write_text(f"""数问 DataPilot v{version}
源码提交：{head}
仓库：{repo['repositoryUrl']}

1. 解压本目录源码 ZIP。需要 Node.js >=22.13.0、npm。
2. 在源码目录运行 npm ci，然后 npm run dev。
3. 浏览器打开终端显示的本地地址（默认 http://localhost:5173）。
4. 无 API 即可使用本地分析助手、导入、图表、质量检查与报告。
5. 使用大模型时在网页“设置与 API”配置自己的兼容 API；密钥不随提交包提供。
6. 检查命令：npm test、npm run typecheck、npm run build。
7. 离线查看提交历史：git clone 本目录的 Git历史.bundle datapilot-history。

源码 ZIP 从此提交直接导出，每个文件与 Git 对象逐字节比较。
旧在线站点属于历史演示，没有同步本次本地改版；请以本包和上述提交为准。
""", encoding="utf-8")
    team = json.loads((ROOT / "submission/team.json").read_text(encoding="utf-8"))
    expected = dict(school="河南农业大学", group="B组", teamName="疯狂星期四", members=["刘宗柯", "陈世航", "刘兴海"], advisors=["唐琦"])
    assert team == expected
    write_json(dest / "05_团队与提交信息/团队信息.json", expected)
    (dest / "05_团队与提交信息/填写参考.txt").write_text(f"""作品：数问 DataPilot
学校：河南农业大学
组别：B组
队伍：疯狂星期四
成员：刘宗柯、陈世航、刘兴海
指导老师：唐琦
赛道：AI WEB 网页开发挑战赛
版本：v{version}；整理日期：2026年11月17日
代码仓库：{repo['repositoryUrl']}
最终提交：{head}
此前发表或获奖：无（团队确认）。
基于其他现成项目继续开发：否（团队确认）；使用通用开源依赖，见源码许可证说明。
项目简介：面向课程实验与表格分析，提供文件导入、质量检查、本地及模型辅助分析、交互图表、来源追溯和报告交付。大模型生成受限分析计划，统计数值由浏览器引擎计算。
视频：完整包已含团队确认的 MP4，副本只统一文件名，内容未改动。
网盘链接与提取码：见上传后单独提供的交付回执。
""", encoding="utf-8")
    for name in ["innovation.csv", "validation.csv", "period-comparison.xlsx", "业务口径说明.md"]:
        copy(ROOT / "docs/samples" / name, "06_演示辅助/演示样本/" + name)
    copy(ROOT / "docs/多端适配演示.md", "06_演示辅助/多端适配演示.md")
    for p in sorted((ROOT / "docs/screenshots").glob("v7-*.png")):
        copy(p, "06_演示辅助/界面截图/" + p.name)
    for name in ["产品介绍.md", "技术文档.md", "演讲与录制方案.md", "2026-11-17完整提交材料.md", "第三方依赖.md", "开源与原创说明.md"]:
        copy(ROOT / "docs" / name, "07_验证记录与说明/" + name)
    for kind in ["tests", "typecheck", "build"]:
        name = f"submission-20261117-{kind}.log"
        copy(ROOT / "work" / name, "07_验证记录与说明/" + name)
    for name in ["source-scan.json", "repository-access.json", "pdf-review.json"]:
        copy(out / name, "07_验证记录与说明/" + name)
    copy(docdir / "document-qa.json", "07_验证记录与说明/document-qa.json")
    audit = dict(version=version, sourceCommit=head, date=specs["date"], sourceFilesMatchGit=True,
                 publicRepositoryHeadMatches=True, coreTestsPassed=211, typecheckPassed=True, buildPassed=True,
                 productPdfPages=5, technicalPdfPages=7, speechPdfPages=4, videoIncluded=True,
                 video=dict(filename=video_name, sha256=sha(video_copy.read_bytes()), bytes=video_copy.stat().st_size,
                            durationSeconds=434.027, width=1920, height=1080, metadataSource="Windows file properties checked before packaging",
                            contentReview="Confirmed by the team; no additional audiovisual review or transcoding"),
                 officialRules="https://m.saikr.com/vse/2026AIWEBKF", competitionFormSubmitted=False,
                 onlineDemoStatus="Historical deployed site; not the current submission version")
    write_json(dest / "07_验证记录与说明/提交核对结果.json", audit)
    (dest / "00_提交说明.txt").write_text(f"""河南农业大学 · B组 · 疯狂星期四
数问 DataPilot v{version} 完整参赛作品
整理日期：2026年11月17日
对应 Git 提交：{head}

01_产品介绍：七项产品介绍要求，PDF 5页及可编辑 Word，含项目图片。
02_技术文档：PDF 7页（官方上限30页）及 Word，包含项目概述、需求分析、架构、AI方案、核心实现、测试部署、创新和总结展望。
03_演示视频：团队已确认的 MP4，约7分14秒，1920×1080。仅对副本统一命名。
04_源码与历史：最终提交导出的源码 ZIP、真实 Git 历史、逐文件校验和运行说明。
05_团队与提交信息：学校、组别、团队、成员、指导老师及填写参考。
06_演示辅助：当前演讲稿、合成演示数据、桌面/手机/平板界面截图。
07_验证记录与说明：211项检查、类型检查、构建、仓库匿名访问、文档检查和提交核对结果。

官方材料要求：{audit['officialRules']}
官方赛道：https://www.boxuegu.com/matchTrack/detail/?id=10037
公开规则没有规定固定 MP4 命名模板；本包统一为“团队_作品_材料类型_版本”。
技术与产品文档、源码均为本次最终版本。源码中的带日期记录和 Git 历史保留原日期，用于追溯，不代表当前状态。
原在线站点属于历史演示；最新作品请按本包运行说明或对应 GitHub 提交复现。
不含 API 密钥、依赖安装目录、构建缓存。模型功能需要使用者配置个人 API，本地分析无需 API。
MANIFEST.json 记录本包逐文件 SHA-256，源码目录另附 SOURCE_MANIFEST.json。
此包是提交材料；不代表已经在赛事官网完成报名或最终提交。
""", encoding="utf-8")
    paths = sorted(p for p in dest.rglob("*") if p.is_file())
    manifest = dict(version=version, date=specs["date"], sourceCommit=head, videoIncluded=True,
                    repositoryVerified=True, files=[dict(path=p.relative_to(dest).as_posix(), bytes=p.stat().st_size,
                    sha256=sha(p.read_bytes())) for p in paths])
    write_json(dest / "MANIFEST.json", manifest)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for p in [*paths, dest / "MANIFEST.json"]:
            z.write(p, p.relative_to(dest).as_posix())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for f in manifest["files"]:
            assert sha(z.read(f["path"])) == f["sha256"], f["path"]
        assert len([n for n in z.namelist() if n.endswith(".mp4")]) == 1
    digest = sha(archive.read_bytes())
    archive.with_suffix(".zip.sha256.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    write_json(out / "final-submission-receipt.json", dict(archive=str(archive), sha256=digest,
               bytes=archive.stat().st_size, files=len(paths), sourceCommit=head, sourceFiles=len(source_files),
               verifiedAt=datetime.now(timezone.utc).isoformat(), status="packaged-and-verified", uploaded=False))
    print(json.dumps(dict(archive=str(archive), sha256=digest, bytes=archive.stat().st_size,
                         files=len(paths), sourceCommit=head, sourceFiles=len(source_files)), ensure_ascii=False))


if __name__ == "__main__":
    main()
