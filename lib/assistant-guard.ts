/** Best-effort per-isolate abuse bounds, not a distributed or billing quota. */
export function createAssistantGate(now: () => number = Date.now) {
  const buckets = new Map<
    string,
    { started: number; used: number; active: number }
  >();
  return (
    request: Request,
  ):
    | { release: () => void; response?: undefined }
    | { response: Response; release?: undefined } => {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return {
        response: Response.json(
          { error: "请从本站发起模型请求。" },
          { status: 403 },
        ),
      };
    const key = request.headers.get("cf-connecting-ip") || "local",
      time = now();
    for (const [id, b] of buckets)
      if (time - b.started >= 60000 && b.active === 0) buckets.delete(id);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 128)
        return {
          response: Response.json(
            { error: "服务繁忙，请稍后重试。" },
            { status: 429, headers: { "Retry-After": "60" } },
          ),
        };
      bucket = { started: time, used: 0, active: 0 };
      buckets.set(key, bucket);
    }
    if (time - bucket.started >= 60000) {
      bucket.started = time;
      bucket.used = 0;
    }
    if (bucket.used >= 12 || bucket.active >= 2)
      return {
        response: Response.json(
          { error: "请求较频繁，请等待当前任务完成，稍后再试。" },
          { status: 429, headers: { "Retry-After": "60" } },
        ),
      };
    bucket.used++;
    bucket.active++;
    let released = false;
    return {
      release: () => {
        if (!released) {
          released = true;
          bucket!.active--;
        }
      },
    };
  };
}
export const acquireAssistant = createAssistantGate();
