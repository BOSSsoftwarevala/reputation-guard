import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled worker (orbitrep-google-sync.timer): for every business with a live
 * Google connection, pulls the latest reviews so operators never have to click
 * "Sync" manually. Triggered by systemd curl (GET) on a fixed interval with a
 * bearer secret validated by authenticateCronRequest.
 */
export const Route = createFileRoute("/api/cron/google-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncBusinessReviews } = await import("@/lib/google-sync.server");

        const { data: connections, error } = await supabaseAdmin
          .from("google_connections")
          .select("business_id,connected_by");
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: { businessId: string; ok: boolean; error?: string; fetched?: number }[] = [];
        for (const conn of connections ?? []) {
          try {
            const summary = await syncBusinessReviews(conn.business_id, conn.connected_by);
            results.push({ businessId: conn.business_id, ok: true, fetched: summary.fetched });
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : "Sync failed";
            results.push({ businessId: conn.business_id, ok: false, error: message });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
