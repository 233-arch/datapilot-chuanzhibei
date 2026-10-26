import { createPlan, requestSchema } from "@/lib/agent";
import { requestModelConfig } from "@/lib/model-config";
import { acquireAssistant } from "@/lib/assistant-guard";
export const dynamic = "force-dynamic";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
export async function GET() {
  return Response.json(
    {
      mode: "demo",
      model: null,
      requiresOwnApi: true,
    },
    { headers },
  );
}
export async function POST(request: Request) {
  const { config, response: configError } = requestModelConfig(request);
  if (configError) return configError;
  const length = Number(request.headers.get("content-length") || "0");
  if (length > 100000)
    return Response.json({ error: "请求过大。" }, { status: 413, headers });
  let payload;
  try {
    const text = await request.text();
    if (text.length > 100000)
      return Response.json({ error: "请求过大。" }, { status: 413, headers });
    payload = requestSchema.parse(JSON.parse(text));
  } catch {
    return Response.json(
      { error: "问题或数据摘要格式不正确。" },
      { status: 400, headers },
    );
  }
  const gate = acquireAssistant(request);
  if (gate.response) return gate.response;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      try {
        send("step", { step: "schema", label: "检索相关字段与统计摘要" });
        send("step", {
          step: "planning",
          label: config.key
            ? "模型正在生成分析计划"
            : "演示引擎正在匹配分析意图",
        });
        const result = await createPlan(
          payload.question,
          payload.profile,
          config,
          fetch,
          { previousPlan: payload.previousPlan, signal: request.signal },
        );
        send("step", { step: "validation", label: "校验字段、指标和聚合权限" });
        send("result", result);
      } catch (error) {
        send("error", {
          error:
            error instanceof Error && error.name === "TimeoutError"
              ? "模型响应超时，请稍后重试。"
              : error instanceof Error && error.name === "ZodError"
                ? "模型计划格式校验失败，请换一种问法。"
                : error instanceof Error
                  ? error.message
                  : "分析失败，请重试。",
        });
      } finally {
        gate.release();
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
