import { knowledgeRequestSchema, answerKnowledge } from "@/lib/knowledge-model";
import { requestModelConfig } from "@/lib/model-config";
import { acquireAssistant } from "@/lib/assistant-guard";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const { config, response: configError } = requestModelConfig(request);
  if (configError) return configError;
  if (!config.key)
    return Response.json(
      { error: "AI 功能需自行接入 API，请在工作空间设置中配置；可以先查看本机检索片段。" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  let input;
  try {
    const text = await request.text();
    if (text.length > 18000)
      return Response.json({ error: "知识摘要过大。" }, { status: 413 });
    input = knowledgeRequestSchema.parse(JSON.parse(text));
  } catch {
    return Response.json(
      { error: "问题或知识片段格式不正确。" },
      { status: 400 },
    );
  }
  const gate = acquireAssistant(request);
  if (gate.response) return gate.response;
  try {
    return Response.json(
      await answerKnowledge(input, config, request.signal, fetch),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "知识回答超时，请重试。"
            : "回答引用校验未通过或服务暂不可用，请查看原文后重试。",
      },
      { status: 502 },
    );
  } finally {
    gate.release();
  }
}
