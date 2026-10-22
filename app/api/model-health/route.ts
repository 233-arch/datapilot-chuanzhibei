import { createPlan } from "@/lib/agent";
import { modelConfig } from "@/lib/model-config";
import { parseCSV, profileDataset, executePlan } from "@/lib/data-engine";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  const config = modelConfig();
  if (!config.key) return Response.json({ ok: false, message: "尚未配置服务端模型密钥。请在部署环境配置后重新验证。" }, { status: 409, headers });
  const started = performance.now();
  try {
    const dataset = parseCSV("地区,金额\n华东,100\n华南,200", "连接验证合成样本.csv");
    const profile = profileDataset(dataset);
    const answer = await createPlan("按地区统计金额合计", profile, config, fetch, { signal: request.signal });
    const result = executePlan(dataset, profile, answer.plan);
    const values = Object.fromEntries(result.points.map(point => [point.name, point.value]));
    if (answer.mode !== "model" || answer.plan.groupBy !== "地区" || answer.plan.metric !== "金额" || answer.plan.aggregate !== "sum" || Object.keys(values).length !== 2 || values.华东 !== 100 || values.华南 !== 200) {
      return Response.json({ ok: false, message: "模型已响应，但固定样本的工具调用或结果未通过校验。请检查模型是否支持 tools / tool_choice。" }, { status: 422, headers });
    }
    return Response.json({ ok: true, latencyMs: Math.round(performance.now()-started), message: "真实模型连接成功，工具调用和 2 行合成样本计算均通过。提交前仍需运行完整固定题集。" }, { headers });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "模型响应超时，请稍后重试。" : error instanceof Error && error.name === "ZodError" ? "模型返回的计划格式不正确。" : error instanceof Error ? error.message : "模型连接验证失败。";
    return Response.json({ok:false,message}, {status:502,headers});
  }
}
