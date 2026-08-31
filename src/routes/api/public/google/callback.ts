import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        const back = (params: Record<string, string>) =>
          new Response(null, {
            status: 302,
            headers: {
              location: `/locations?${new URLSearchParams(params).toString()}`,
            },
          });

        if (oauthError) return back({ google: "error", message: oauthError });
        if (!code || !state) return back({ google: "error", message: "Missing authorization code." });

        const { verifyState } = await import("@/lib/google.server");
        const parsed = verifyState(state);
        if (!parsed) return back({ google: "error", message: "Invalid or expired authorization state." });

        try {
          const { saveConnection } = await import("@/lib/google-sync.server");
          await saveConnection({
            businessId: parsed.businessId,
            userId: parsed.userId,
            code,
            redirectUri: `${url.origin}/api/public/google/callback`,
          });
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "Google connection failed.";
          return back({ google: "error", message });
        }

        return back({ google: "connected" });
      },
    },
  },
});
