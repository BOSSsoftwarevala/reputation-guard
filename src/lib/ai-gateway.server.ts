import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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

/** Model used for high-volume policy scanning. */
export const SCAN_MODEL = "google/gemini-3.7-flash";
/** Model used for drafting public review responses. */
export const RESPONSE_MODEL = "google/gemini-3.7-flash";

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
