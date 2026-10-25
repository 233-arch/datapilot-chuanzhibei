export type ModelSettings = { key?: string; url?: string; model?: string };
export async function modelTool(
  config: ModelSettings,
  name: string,
  description: string,
  parameters: unknown,
  system: string,
  input: unknown,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  if (!config.key) throw new Error("真实模型未配置，请先在设置中验证连接。");
  const base = (config.url || "https://api.deepseek.com").replace(/\/$/, ""),
    url = new URL(base);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("模型服务端点无效。");
  const started = performance.now();
  const response = await fetcher(base + "/chat/completions", {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.key,
    },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: config.model || "deepseek-flash",
      ...(url.hostname === "api.deepseek.com"
        ? { thinking: { type: "disabled" } }
        : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
      tools: [
        { type: "function", function: { name, description, parameters } },
      ],
      tool_choice: { type: "function", function: { name } },
      max_tokens: 1800,
    }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "模型频率或额度受限，请稍后重试。"
        : "模型服务暂不可用，请稍后重试。",
    );
  const body = (await response.json()) as {
    choices?: {
      message?: {
        tool_calls?: { function?: { name: string; arguments: string } }[];
      };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const calls = body.choices?.[0]?.message?.tool_calls;
  if (calls?.length !== 1 || calls[0].function?.name !== name)
    throw new Error("模型未返回指定的工具计划，请重试。");
  return {
    value: JSON.parse(calls[0].function.arguments),
    mode: "model" as const,
    latencyMs: Math.round(performance.now() - started),
    usage: {
      input: body.usage?.prompt_tokens ?? null,
      output: body.usage?.completion_tokens ?? null,
    },
  };
}
