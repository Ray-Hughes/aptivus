import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The one place we talk to Claude.
 *
 * Everything here is optional: without a key the features that need it say so
 * plainly rather than half-working. Nothing in the core product depends on it.
 */
export const MODEL = "claude-opus-5";

export const aiConfigured = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
);

let client: Anthropic | null = null;
function getClient() {
  if (!aiConfigured) return null;
  if (!client) client = new Anthropic();
  return client;
}

export type AiFailure =
  | { kind: "unconfigured" }
  | { kind: "rate_limited" }
  | { kind: "refused" }
  | { kind: "invalid"; detail: string }
  | { kind: "error"; detail: string };

export type AiResult<T> = { ok: true; value: T } | { ok: false; failure: AiFailure };

/**
 * Ask for JSON matching a schema and get it back parsed, or a typed failure.
 * Structured output is used rather than "please reply with JSON", because a
 * model that returns prose here becomes a crash three functions away.
 */
export async function generateJson<T>({
  system, prompt, schema, maxTokens = 16000, effort = "medium",
}: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<AiResult<T>> {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, failure: { kind: "unconfigured" } };

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      output_config: {
        effort,
        format: { type: "json_schema", schema },
      },
      messages: [{ role: "user", content: prompt }],
    } as Parameters<typeof anthropic.messages.create>[0]);

    if ("stop_reason" in res && res.stop_reason === "refusal") {
      return { ok: false, failure: { kind: "refused" } };
    }
    const text = ("content" in res ? res.content : [])
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return { ok: true, value: JSON.parse(text) as T };
    } catch {
      return { ok: false, failure: { kind: "invalid", detail: text.slice(0, 300) } };
    }
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err.status === 429) return { ok: false, failure: { kind: "rate_limited" } };
    if (err.status === 401 || err.status === 403) {
      return { ok: false, failure: { kind: "unconfigured" } };
    }
    return { ok: false, failure: { kind: "error", detail: err.message ?? "unknown" } };
  }
}

/** Plain prose, for the coaching answers. */
export async function generateText({
  system, prompt, maxTokens = 16000,
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<AiResult<string>> {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, failure: { kind: "unconfigured" } };
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: prompt }],
    } as Parameters<typeof anthropic.messages.create>[0]);

    if ("stop_reason" in res && res.stop_reason === "refusal") {
      return { ok: false, failure: { kind: "refused" } };
    }
    const text = ("content" in res ? res.content : [])
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { ok: true, value: text };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err.status === 429) return { ok: false, failure: { kind: "rate_limited" } };
    if (err.status === 401 || err.status === 403) {
      return { ok: false, failure: { kind: "unconfigured" } };
    }
    return { ok: false, failure: { kind: "error", detail: err.message ?? "unknown" } };
  }
}

export function failureMessage(f: AiFailure): string {
  switch (f.kind) {
    case "unconfigured":
      return "AI features are not switched on for this deployment yet.";
    case "rate_limited":
      return "Too many requests just now. Try again in a moment.";
    case "refused":
      return "The model declined that request. Try rephrasing.";
    case "invalid":
      return "The response could not be read. Try again.";
    default:
      return "Something went wrong reaching the model.";
  }
}
