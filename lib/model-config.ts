import { MODEL_PROVIDERS, validateVisitorModel } from "./visitor-credentials";
import type { ModelSettings } from "./model-tool";

/** Request-scoped BYOK only. Never fall back to a deployment owner's credentials. */
export function modelConfig(request?: Request): ModelSettings {
  const key = request?.headers.get("X-DataPilot-Api-Key");
  if (!key) return {};
  const config = validateVisitorModel({
    key,
    provider: request!.headers.get("X-DataPilot-Provider") || "deepseek",
    model: request!.headers.get("X-DataPilot-Model") || "deepseek-flash",
  });
  return { key: config.key, model: config.model, url: MODEL_PROVIDERS[config.provider].url };
}
export function requestModelConfig(request: Request) {
  try { return { config: modelConfig(request), response: undefined }; }
  catch {
    return { config: {} as ModelSettings, response: Response.json(
      { ok: false, error: "API 配置无效，请在工作空间设置中重新填写。", message: "API 配置无效，请在工作空间设置中重新填写。" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    ) };
  }
}
