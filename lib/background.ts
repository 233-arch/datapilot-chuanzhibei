/// <reference types="vite/client" />
import AnalysisWorker from "./analysis.worker?worker";
export async function backgroundTask<T>(
  type: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new AnalysisWorker();
    } catch {
      reject(new Error("浏览器无法启动后台计算，请检查浏览器设置后重试。"));
      return;
    }
    const id = crypto.randomUUID(),
      timer = setTimeout(
        () => finish(new Error("后台计算超时，请精简文件后重试。")),
        60000,
      );
    const cancel = () => finish(new DOMException("已取消", "AbortError"));
    function finish(error?: Error, result?: T) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      error ? reject(error) : resolve(result as T);
    }
    worker.onmessage = (event) => {
      if (event.data.id === id)
        finish(
          event.data.error ? new Error(event.data.error) : undefined,
          event.data.result,
        );
    };
    worker.onerror = () =>
      finish(new Error("后台计算失败，请检查文件后重试。"));
    signal?.addEventListener("abort", cancel, { once: true });
    worker.postMessage({ id, type, payload });
  });
}
