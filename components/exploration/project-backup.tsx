"use client";
import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, Download, Upload, ShieldCheck } from "lucide-react";
import { BACKUP_LIMIT, createBackup, inspectBackup, type BackupPreview } from "@/lib/workspace-backup";
import type { WorkspaceSnapshot } from "@/lib/workspace-snapshot";
async function prepareDownload(snapshot: WorkspaceSnapshot) {
  const text = await createBackup(snapshot);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const name = `${snapshot.dataset.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f\s·]/g, "_").replace(/_+/g, "_").slice(0, 100)}_${new Date().toISOString().slice(0, 10)}.datapilot.json`;
  return { url, name };
}
export async function downloadProject(snapshot: WorkspaceSnapshot) {
  const { url, name } = await prepareDownload(snapshot);
  const link = document.createElement("a"); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function ProjectBackup({ snapshot, disabled, onRestore }: { snapshot: WorkspaceSnapshot; disabled: boolean; onRestore: (preview: BackupPreview) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.url); }, [file]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); setMessage(""); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "操作未完成，请重试。"); } finally { setBusy(false); } }
  return <section className="project-backup product-panel" aria-labelledby="project-backup-title">
    <header><div><span className="product-eyebrow"><ArchiveRestore size={17} />项目备份</span><h2 id="project-backup-title">把这次工作，带到下一台电脑</h2><p>打包当前数据、分析、筛选、规则、知识文档与报告草稿。数据集库中的其他副本请分别备份。</p></div></header>
    <div className="product-actions"><button className="button primary" disabled={disabled || busy} onClick={() => void run(async () => { setFile(await prepareDownload(snapshot)); setMessage("备份已生成。点击下方链接保存文件；内容为生成时的项目快照。"); })}><Download size={17} />导出当前项目</button><button className="button subtle" disabled={disabled || busy} onClick={() => input.current?.click()}><Upload size={17} />从备份恢复</button><span className="product-hint"><ShieldCheck size={15} />不包含 API 密钥 · 上限 75 MB</span></div>
    <input hidden ref={input} type="file" accept=".json" aria-label="选择项目备份" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setPreview(null); void run(async () => { if (file.size > BACKUP_LIMIT) throw new Error("备份超过 75 MB，无法读取。"); setPreview(await inspectBackup(await file.text())); }); }} />
    {file && <a className="button primary backup-file-link" href={file.url} download={file.name}>保存备份文件 · {file.name}</a>}
    {busy && <p role="status">正在处理项目备份…</p>}{error && <p className="product-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {preview && <div className="backup-preview"><h3>恢复预览 · {preview.snapshot.dataset.name}</h3><p>{preview.snapshot.dataset.rows.length.toLocaleString()} 条记录 · {preview.snapshot.entries.length} 项分析 · {preview.snapshot.pins.length} 项收藏 · {preview.snapshot.tools.rules.length} 条规则</p><p>备份时间：{new Date(preview.createdAt).toLocaleString("zh-CN")} · 文件版本 1 · 校验通过</p><p>将打开为独立项目，当前工作先保存到数据集库。报告草稿会一同恢复。</p>{preview.warnings.map(w => <p className="product-error" key={w}>{w}</p>)}<div className="product-actions"><button className="button primary" disabled={disabled || busy} onClick={() => void run(async () => { await onRestore(preview); setPreview(null); setMessage("项目已恢复，可以继续分析。"); })}>确认恢复项目</button><button className="button subtle" disabled={busy} onClick={() => setPreview(null)}>取消</button></div></div>}
  </section>;
}
