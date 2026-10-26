export const MODEL_PROVIDERS = {
  deepseek: { label: "DeepSeek", url: "https://api.deepseek.com", defaultModel: "deepseek-flash" },
  openai: { label: "OpenAI", url: "https://api.openai.com/v1", defaultModel: "" },
} as const;
export type VisitorModel = { provider: keyof typeof MODEL_PROVIDERS; key: string; model: string };

/** Accept only fixed HTTPS providers: the public relay cannot target arbitrary hosts. */
export function validateVisitorModel(input: { provider: string; key: string; model: string }): VisitorModel {
  if (!Object.hasOwn(MODEL_PROVIDERS, input.provider)) throw new Error("请选择支持的 API 服务商。");
  const key = input.key.trim(), model = input.model.trim();
  if (!/^[\x21-\x7e]{8,4096}$/.test(key)) throw new Error("API Key 格式不正确，请检查后重新填写。");
  if (!/^[a-zA-Z0-9._:/-]{1,100}$/.test(model)) throw new Error("请填写有效的模型 ID（最多 100 个字符）。");
  return { provider: input.provider as VisitorModel["provider"], key, model };
}
export function credentialHeaders(config: VisitorModel | null): Record<string, string> {
  return config ? {
    "X-DataPilot-Api-Key": config.key,
    "X-DataPilot-Provider": config.provider,
    "X-DataPilot-Model": config.model,
  } : {};
}
