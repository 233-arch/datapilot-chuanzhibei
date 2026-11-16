import { libraryItem, snapshotFields, updateLibraryIndex, type LibraryItem, type WorkspaceSnapshot } from "./workspace-snapshot";
const DB = "datapilot-local-v1", INDEX = "library-index";
const copyKey = (id: string) => `dataset-copy:${id}`;
type Stored = Omit<WorkspaceSnapshot, "dataset"> & { format: 2; datasetKey: string; revision: string };
let revision: string | undefined;
let queue: Promise<unknown> = Promise.resolve();
const payloadKeys = new WeakMap<object, Promise<string>>();
const transactionFailures = new WeakMap<IDBTransaction, unknown>();
export class StorageConflictError extends Error {
  constructor() { super("另一个标签页已保存新的工作。当前修改仍在此页，请先导出项目备份，再载入另一页的版本。"); this.name = "StorageConflictError"; }
}
function serial<T>(operation: () => Promise<T>): Promise<T> { const result = queue.then(operation, operation); queue = result.catch(() => undefined); return result; }
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("本机数据库被其他页面占用，请关闭旧版本页面后重试。"));
  });
}
const storedRevision = (value: unknown): string => (value as Stored)?.revision || "legacy";
async function dataKey(value: WorkspaceSnapshot): Promise<string> {
  let pending = payloadKeys.get(value.dataset);
  if (!pending) {
    pending = crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value.dataset))).then(bytes => "data:" + Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join(""));
    payloadKeys.set(value.dataset, pending);
  }
  return pending;
}
function putSnapshot(store: IDBObjectStore, key: string, value: WorkspaceSnapshot, datasetKey: string, nextRevision: string) {
  const { dataset, ...state } = snapshotFields(value);
  const exists = store.count(datasetKey);
  exists.onsuccess = () => { try { if (!exists.result) store.put(dataset, datasetKey); } catch (error) { transactionFailures.set(store.transaction, error); store.transaction.abort(); } };
  store.put({ ...state, format: 2, datasetKey, revision: nextRevision } satisfies Stored, key);
}
async function read(key: string): Promise<WorkspaceSnapshot | null> {
  await queue;
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("workspace"), store = tx.objectStore("workspace");
      const request = store.get(key);
      let value: WorkspaceSnapshot | null = null, readRevision = "legacy", failure: Error | undefined;
      request.onsuccess = () => {
        const raw = request.result; readRevision = storedRevision(raw);
        if (!raw) return;
        if (raw.format !== 2) { value = raw; return; }
        const payload = store.get(raw.datasetKey);
        payload.onsuccess = () => {
          if (!payload.result) { failure = new Error("项目数据不完整，已有记录不会被覆盖。请恢复项目备份。"); return; }
          const { format, datasetKey, revision: _revision, ...state } = raw;
          value = { ...state, dataset: payload.result };
        };
      };
      tx.oncomplete = () => { if (failure) reject(failure); else { if (key === "current") revision = readRevision; resolve(value); } };
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("无法读取本机项目"));
    });
  } finally { db.close(); }
}
export const readWorkspace = <T>(): Promise<T | null> => read("current") as Promise<T | null>;
export const readLibraryWorkspace = (id: string) => read(copyKey(id));
function validIndex(value: unknown): LibraryItem[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => !item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" ||
    typeof item.savedAt !== "string" || !Number.isFinite(Date.parse(item.savedAt)) ||
    [item.rows, item.columns, item.analyses, item.pins, item.rules].some(n => !Number.isInteger(n) || n < 0)) ||
    new Set(value.map(item => item.id)).size !== value.length) throw new Error("数据集库索引无法读取，请先导出当前项目备份。");
  return value;
}
export async function listLibrary(): Promise<LibraryItem[]> {
  await queue; const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction("workspace").objectStore("workspace").get(INDEX);
    request.onsuccess = () => { try { resolve(validIndex(request.result).sort((a,b) => b.savedAt.localeCompare(a.savedAt))); } catch (error) { reject(error); } };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
// Walk keys only: loading every stored data payload would undo the benefit of splitting storage.
function prunePayloads(store: IDBObjectStore, items: LibraryItem[]) {
  const used = new Set<string>();
  let remaining = items.length + 1;
  for (const key of ["current", ...items.map(item => copyKey(item.id))]) {
    const req = store.get(key);
    req.onsuccess = () => {
      if (req.result?.format === 2) used.add(req.result.datasetKey);
      if (--remaining) return;
      const cursor = store.openKeyCursor(IDBKeyRange.bound("data:", "data:\uffff"));
      cursor.onsuccess = () => { const row = cursor.result; if (row) { if (!used.has(String(row.key))) store.delete(row.key); row.continue(); } };
    };
  }
}
function mutate(change: (store: IDBObjectStore, items: LibraryItem[], nextRevision: string, currentDataKey?: string) => void, updatesCurrent: boolean, prepare?: () => Promise<void>): Promise<void> {
  return serial(async () => {
    await prepare?.();
    const db = await database(); const nextRevision = crypto.randomUUID();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspace", "readwrite"), store = tx.objectStore("workspace"); let failure: unknown;
      const current = store.get("current");
      current.onsuccess = () => {
        if (revision === undefined || revision !== storedRevision(current.result)) { failure = new StorageConflictError(); tx.abort(); return; }
        const index = store.get(INDEX);
        index.onsuccess = () => { try { change(store, validIndex(index.result), nextRevision, current.result?.datasetKey); } catch (error) { failure = error; tx.abort(); } };
      };
      tx.oncomplete = () => { if (updatesCurrent) revision = nextRevision; resolve(); };
      tx.onabort = tx.onerror = () => reject(failure || transactionFailures.get(tx) || tx.error || new Error("本机保存未完成，请重试或导出项目备份。"));
    }); } finally { db.close(); }
  });
}
export async function writeWorkspace(value: WorkspaceSnapshot): Promise<void> {
  let key = "";
  return mutate((store, items, next, currentDataKey) => {
    putSnapshot(store, "current", value, key, next);
    // Queue after the payload count request so all new writes precede GC reads.
    if (currentDataKey !== key) { const marker = store.get("current"); marker.onsuccess = () => prunePayloads(store, items); }
  }, true, async () => { key = await dataKey(value); });
}
export async function saveLibraryWorkspace(value: WorkspaceSnapshot, next?: WorkspaceSnapshot): Promise<void> {
  let key = "", nextKey = "";
  return mutate((store, items, nextRevision) => {
    const item = libraryItem(value); const updated = updateLibraryIndex(items, item);
    putSnapshot(store, copyKey(item.id), value, key, nextRevision); store.put(updated, INDEX);
    if (next) putSnapshot(store, "current", next, nextKey, nextRevision);
  }, !!next, async () => { key = await dataKey(value); nextKey = next ? await dataKey(next) : ""; });
}
export async function deleteLibraryWorkspace(id: string): Promise<void> {
  return mutate((store, items) => { const remaining = items.filter(item => item.id !== id); store.delete(copyKey(id)); store.put(remaining, INDEX); prunePayloads(store, remaining); }, false);
}
