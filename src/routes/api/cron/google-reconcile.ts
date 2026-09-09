import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled worker (orbitrep-google-reconcile.timer): for every business with a
 * live Google connection, checks whether previously reported reviews have been
 * removed by Google and updates case outcomes automatically (no manual "check
 * status" click needed).
 */
export const Route = createFileRoute("/api/cron/google-reconcile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { reconcileOutcomes } = await import("@/lib/google-sync.server");

        const { data: connections, error } = await supabaseAdmin
          .from("google_connections")
          .select("business_id,connected_by");
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: { businessId: string; ok: boolean; error?: string; resolved?: number; stillLive?: number }[] =
          [];
        for (const conn of connections ?? []) {
          try {
            const outcome = await reconcileOutcomes(conn.business_id, conn.connected_by);
            results.push({
              businessId: conn.business_id,
              ok: true,
              resolved: outcome.resolved,
              stillLive: outcome.stillLive,
            });
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : "Reconcile failed";
            results.push({ businessId: conn.business_id, ok: false, error: message });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
