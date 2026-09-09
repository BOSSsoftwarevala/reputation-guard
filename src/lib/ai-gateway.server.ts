import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => {};
  let runIdResolved = false;
  const runIdReady = new Promise<string | undefined>((resolve) => {
    resolveRunId = resolve;
  });

  const publishRunId = (value?: string) => {
    const nextRunId = value?.trim() || undefined;
    if (!runId && nextRunId) runId = nextRunId;
    if (!runIdResolved) {
      runIdResolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publishRunId(runId);

  return {
    fetch: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      try {
        const response = await fetch(input, { ...init, headers });
        publishRunId(response.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined);
        return response;
      } catch (error) {
        publishRunId(undefined);
        throw error;
      }
    },
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : runIdReady),
  };
}

export function createLovableAiGatewayProvider(lovableApiKey: string, initialRunId?: string) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);

  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: false,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });

  return Object.assign(provider, {
    getRunId: runIdFetch.getRunId,
    waitForRunId: runIdFetch.waitForRunId,
  });
}

/**
 * Creates a provider against a custom OpenAI-compatible gateway (e.g. a
 * self-hosted Claude proxy) using AI_GATEWAY_BASE_URL / AI_GATEWAY_API_KEY.
 * Falls back to the real Lovable AI gateway when those aren't set.
 */
function createCustomGatewayProvider(baseURL: string, apiKey: string) {
  return createOpenAICompatible({
    name: "custom-gateway",
    baseURL,
    supportsStructuredOutputs: false,
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });
}

/** Model used for high-volume policy scanning. */
export const SCAN_MODEL =
  process.env["CLAUDE_API_KEY"] || process.env["ANTHROPIC_API_KEY"] || process.env["AI_GATEWAY_BASE_URL"]
    ? (process.env["AI_SCAN_MODEL"] ?? "claude-3-5-sonnet-20241022")
    : "google/gemini-3.7-flash";
/** Model used for drafting public review responses. */
export const RESPONSE_MODEL =
  process.env["CLAUDE_API_KEY"] || process.env["ANTHROPIC_API_KEY"] || process.env["AI_GATEWAY_BASE_URL"]
    ? (process.env["AI_RESPONSE_MODEL"] ?? "claude-3-5-sonnet-20241022")
    : "google/gemini-3.7-flash";

/**
 * Resolves the configured AI provider. Priority order:
 * 1. Real Anthropic API (CLAUDE_API_KEY, or the ANTHROPIC_API_KEY fallback) —
 *    talks to api.anthropic.com directly, no third-party gateway involved.
 * 2. A custom OpenAI-compatible gateway (AI_GATEWAY_BASE_URL + AI_GATEWAY_API_KEY).
 * 3. The real Lovable AI gateway via LOVABLE_API_KEY.
 */
export function requireAiProvider() {
  const anthropicKey = process.env["CLAUDE_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"];
  if (anthropicKey) {
    return createAnthropic({ apiKey: anthropicKey });
  }

  const gatewayBaseUrl = process.env["AI_GATEWAY_BASE_URL"];
  const gatewayApiKey = process.env["AI_GATEWAY_API_KEY"] ?? process.env["LOVABLE_API_KEY"];
  if (gatewayBaseUrl) {
    if (!gatewayApiKey) {
      throw new Error("AI_GATEWAY_BASE_URL is set but AI_GATEWAY_API_KEY is missing.");
    }
    return createCustomGatewayProvider(gatewayBaseUrl, gatewayApiKey);
  }
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("AI is not configured for this workspace (missing gateway key).");
  return createLovableAiGatewayProvider(lovableKey);
}

export function requireLovableApiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this workspace (missing gateway key).");
  return key;
}

/** Maps an AI gateway failure onto a user-facing message + retryability. */
export function describeGatewayError(error: unknown): { message: string; retryable: boolean } {
  const raw = error instanceof Error ? error.message : String(error);
  const status = /\b(400|401|402|403|429|5\d\d)\b/.exec(raw)?.[1];
  switch (status) {
    case "402":
      return { message: "AI credits are exhausted. Add credits to continue scanning.", retryable: false };
    case "403":
      return { message: "AI access is blocked by workspace policy.", retryable: false };
    case "401":
      return { message: "AI gateway credentials are invalid.", retryable: false };
    case "429":
      return { message: "AI rate limit reached. The scan will resume shortly.", retryable: true };
    case "400":
      return { message: "The AI request was rejected as invalid.", retryable: false };
    default:
      return { message: raw.slice(0, 300) || "Unexpected AI gateway error.", retryable: true };
  }
}
