import { comparePeriods } from "../lib/diagnostics";
import {
  profileDataset,
  parseCSV,
  LIMITS,
  type Dataset,
  type Profile,
} from "../lib/data-engine";
import {
  checkWorkbookArchive,
  importSheet,
  type Sheet,
  type ImportOptions,
} from "../lib/import-sheet";
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;
  try {
    if (type === "comparison") {
      const result = comparePeriods(
        payload.dataset,
        payload.profile,
        payload.input,
      );
      self.postMessage({ id, result });
      return;
    }
    if (type === "profile") {
      self.postMessage({ id, result: profileDataset(payload) });
      return;
    }
    if (type === "csv") {
      const result = parseCSV(payload.text, payload.name);
      self.postMessage({
        id,
        result: { dataset: result, profile: profileDataset(result) },
      });
      return;
    }
    if (type === "sheet") {
      const result = importSheet(
        payload.sheet as Sheet,
        payload.name,
        payload.options as ImportOptions,
      );
      self.postMessage({
        id,
        result: { dataset: result, profile: profileDataset(result) },
      });
      return;
    }
    if (type === "excel") {
      checkWorkbookArchive(payload.buffer);
      const read = (await import("read-excel-file/universal")).default;
      const sheets = await read(payload.buffer);
      let cells = 0;
      for (const sheet of sheets) {
        if (sheet.data.length > LIMITS.rows + 25)
          throw new Error("工作表超过20,000行，请拆分文件。");
        for (const row of sheet.data) {
          cells += row.length;
          if (row.length > 80 || cells > 2000000)
            throw new Error("工作簿展开后过大，请拆分工作表。");
        }
      }
      self.postMessage({ id, result: sheets });
      return;
    }
    throw new Error("不支持的后台计算任务。");
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "后台计算失败",
    });
  }
};
