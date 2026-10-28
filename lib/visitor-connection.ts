import { credentialHeaders, validateVisitorModel, type VisitorModel } from "./visitor-credentials";

type ConnectionResult = { ok: boolean; message: string };

/** A candidate never replaces the active credentials until its own probe succeeds. */
export function createVisitorConnection(
  apply: (config: VisitorModel) => void,
  request: typeof fetch = fetch,
) {
  let pending: AbortController | null = null;
  function cancel() { pending?.abort(); pending = null; }
  async function connect(input: VisitorModel): Promise<ConnectionResult | null> {
    cancel();
    let candidate: VisitorModel;
    try { candidate = validateVisitorModel(input); }
    catch (error) { return { ok: false, message: (error as Error).message }; }
    const controller = new AbortController();
    pending = controller;
    const isCurrent = () => pending === controller && !controller.signal.aborted;
    try {
      const response = await request("/api/model-health", {
        method: "POST",
        headers: credentialHeaders(candidate),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(50000)]),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!isCurrent()) return null;
      const ok = response.ok && result.ok === true;
      if (ok) apply(candidate);
      return { ok, message: result.message || (ok ? "连接验证通过，已应用个人 API。" : "验证未通过，请检查密钥、模型和账户额度。") };
    } catch {
      return isCurrent() ? { ok: false, message: "连接超时或服务暂不可用，请检查配置后重试。" } : null;
    } finally {
      if (pending === controller) pending = null;
    }
  }
  return { connect, cancel };
}
