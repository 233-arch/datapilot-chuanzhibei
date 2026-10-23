import { explanationRequest, explainFacts } from "@/lib/explainer";
import { modelConfig } from "@/lib/model-config";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!modelConfig().key)
    return Response.json(
      { error: "真实模型未配置，仍可查看本机计算证据。" },
      { status: 409 },
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
  try {
    return Response.json(
      await explainFacts(payload.facts, modelConfig(), fetch, request.signal),
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
  }
}
