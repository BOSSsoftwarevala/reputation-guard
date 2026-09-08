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

        // Must exactly match the redirect_uri sent when starting the OAuth flow
        // (which trusts the forwarded proto/host behind nginx), or Google's
        // token exchange rejects it as a mismatch.
        const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
        const host = request.headers.get("x-forwarded-host") ?? url.host;
        const redirectUri = `${proto}://${host}/api/public/google/callback`;

        try {
          const { saveConnection, autoLinkSingleLocation, syncBusinessReviews } = await import(
            "@/lib/google-sync.server"
          );
          await saveConnection({
            businessId: parsed.businessId,
            userId: parsed.userId,
            code,
            redirectUri,
          });

          // Fully automated path: single-location workspaces link + sync without
          // any further clicks from the operator, then the AI scan starts on its own.
          const linked = await autoLinkSingleLocation(parsed.businessId).catch(() => false);
          if (linked) {
            await syncBusinessReviews(parsed.businessId, parsed.userId).catch(() => null);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { count } = await supabaseAdmin
              .from("reviews")
              .select("id", { count: "exact", head: true })
              .eq("business_id", parsed.businessId)
              .in("scan_status", ["unscanned", "failed"]);
            await supabaseAdmin.from("scan_jobs").insert({
              business_id: parsed.businessId,
              created_by: parsed.userId,
              total_reviews: count ?? 0,
              status: "running",
              lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
            });
            return back({ google: "connected", synced: "1" });
          }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "Google connection failed.";
          return back({ google: "error", message });
        }

        return back({ google: "connected" });
      },
    },
  },
});
