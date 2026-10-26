import { explanationRequest, explainFacts } from "@/lib/explainer";
import { requestModelConfig } from "@/lib/model-config";
import { acquireAssistant } from "@/lib/assistant-guard";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const { config, response: configError } = requestModelConfig(request);
  if (configError) return configError;
  if (!config.key)
    return Response.json(
      { error: "AI 功能需自行接入 API，请在工作空间设置中配置；仍可查看本机计算证据。" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  let payload;
  try {
    const text = await request.text();
    if (text.length > 18000)
      return Response.json({ error: "统计摘要过大。" }, { status: 413 });
    payload = explanationRequest.parse(JSON.parse(text));
  } catch {
    return Response.json({ error: "事实摘要格式不正确。" }, { status: 400 });
  }
  const gate = acquireAssistant(request);
  if (gate.response) return gate.response;
  try {
    return Response.json(
      await explainFacts(payload.facts, config, fetch, request.signal),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "模型解读超时，可重试；计算证据仍然可用。"
            : "AI解读未完成，请重试；计算证据仍然可用。",
      },
      { status: 502 },
    );
  } finally {
    gate.release();
  }
}
