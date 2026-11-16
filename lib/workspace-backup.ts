import { profileDataset } from "./data-engine";
import { restoreSnapshot, snapshotFields, validateStoredDataset, type WorkspaceSnapshot } from "./workspace-snapshot";

export const BACKUP_LIMIT = 75 * 1024 * 1024;
export type BackupPreview = { snapshot: WorkspaceSnapshot; createdAt: string; warnings: string[] };
async function digest(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), b => b.toString(16).padStart(2, "0")).join("");
}
export async function createBackup(value: WorkspaceSnapshot): Promise<string> {
  const workspace = snapshotFields(value);
  const body = JSON.stringify(workspace);
  const result = JSON.stringify({ format: "datapilot-workspace", version: 1, createdAt: new Date().toISOString(), checksum: await digest(body), workspace });
  if (new TextEncoder().encode(result).length > BACKUP_LIMIT) throw new Error("项目备份超过 75 MB，请先减少数据或分析记录。");
  return result;
}
export async function inspectBackup(text: string): Promise<BackupPreview> {
  if (new TextEncoder().encode(text).length > BACKUP_LIMIT) throw new Error("备份超过 75 MB，无法读取。");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("备份不是有效的 JSON 文件，当前工作保持不变。"); }
  if (!value || value.format !== "datapilot-workspace") throw new Error("请选择 DataPilot 导出的项目备份文件。");
  if (value.version !== 1) throw new Error("此备份版本暂不支持，请使用对应版本的 DataPilot 打开。");
  if (typeof value.checksum !== "string" || await digest(JSON.stringify(value.workspace) ?? "") !== value.checksum) throw new Error("备份校验失败：文件内容可能已损坏或被修改。");
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) throw new Error("备份时间格式无效。");
  const dataset = validateStoredDataset(value.workspace?.dataset);
  const snapshot = restoreSnapshot(value.workspace, profileDataset(dataset));
  const warnings: string[] = [];
  for (const key of ["entries", "pins", "filters"] as const) {
    if (!Array.isArray(value.workspace[key])) throw new Error("备份缺少必要的工作空间信息。");
    if (value.workspace[key].length !== snapshot[key].length) warnings.push(`部分${{ entries: "分析记录", pins: "收藏", filters: "筛选" }[key]}不兼容，恢复时会跳过。`);
  }
  if ((value.workspace.tools?.rules?.length || 0) !== snapshot.tools.rules.length) warnings.push("部分业务规则不适用于当前字段，将跳过。");
  return { snapshot, createdAt: value.createdAt, warnings };
}
export function importedSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const id = `restored-${crypto.randomUUID()}`;
  return { ...snapshot, dataset: { ...snapshot.dataset, id }, tools: { ...snapshot.tools, datasetId: id }, journey: { ...snapshot.journey, datasetId: id } };
}
