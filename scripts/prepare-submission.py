"""Package an explicit allowlist of review materials; never includes local keys."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

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
for name in ["提交审查.md", "提交准备.md", "测试报告.md", "竞品调研.md", "开源与原创说明.md", "第三方依赖.md", "录制讲解稿.md", "演示脚本.md"]:
    files[ROOT / "docs" / name] = "documents/" + name
for name in ["提交检查结果.md", "submission-audit.json", "model-evaluation.json", "hosted-model-verification.json", "model-secret-scan.json", "pdf-review.json", "repository-access.json", "source-scan.json"]:
    candidate = OUT / name
    if candidate.exists():
        files[candidate] = "evidence/" + name
audit_path = OUT / "submission-audit.json"
audit = json.loads(audit_path.read_text(encoding="utf-8")) if audit_path.exists() else {}
remaining = [item["id"] for item in audit.get("checks", []) if item.get("status") in ["blocked", "review"]]
version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
manifest = {"version": version, "commit": commit, "isFinalSubmission": False, "remainingChecks": remaining, "notice": "这是审阅准备包。尚未完成的材料以当前提交检查结果为准，不能冒充最终提交。", "files": []}
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
