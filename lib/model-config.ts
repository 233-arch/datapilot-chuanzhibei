import { env } from "cloudflare:workers";

/** Server-only configuration; callers never receive keys or the provider URL. */
export function modelConfig() {
  const bindings = env as unknown as Record<string, string | undefined>;
  return {
    key: (bindings.DATA_MODEL_API_KEY || process.env.DATA_MODEL_API_KEY)?.trim(),
    url: (bindings.DATA_MODEL_URL || process.env.DATA_MODEL_URL)?.trim(),
    model: (bindings.DATA_MODEL_NAME || process.env.DATA_MODEL_NAME)?.trim(),
  };
}
