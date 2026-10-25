import { workflowRequestSchema, createWorkflow } from "@/lib/workflow-model";
import { modelConfig } from "@/lib/model-config";
import { acquireAssistant } from "@/lib/assistant-guard";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!modelConfig().key)
    return Response.json(
      { error: "请先配置并验证真实模型；仍可使用业务诊断手动分析。" },
      { status: 409 },
    );
  let input;
  try {
    const text = await request.text();
    if (text.length > 100000)
      return Response.json({ error: "问题与摘要过大。" }, { status: 413 });
    input = workflowRequestSchema.parse(JSON.parse(text));
  } catch {
    return Response.json(
      { error: "问题或字段摘要格式不正确。" },
      { status: 400 },
    );
  }
  const gate = acquireAssistant(request);
  if (gate.response) return gate.response;
  try {
    return Response.json(
      await createWorkflow(input, modelConfig(), request.signal, fetch),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "模型规划超时，请重试。"
            : "未能生成有效周期计划，请明确指标、日期和分解维度后重试。",
      },
      { status: 502 },
    );
  } finally {
    gate.release();
  }
}
