import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled worker (orbitrep-scan.timer): advances every running scan job by one
 * batch, and opens a new job for any business that has unscanned/failed reviews
 * but no active job, so Claude analysis runs automatically after sync — no
 * manual "Scan" click required.
 */
const BATCH = 8;

export const Route = createFileRoute("/api/cron/scan-worker")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { analyzeReviews } = await import("@/lib/review-analysis.server");

        const now = new Date().toISOString();

        // Reclaim expired leases and start a fresh job for any business with
        // unscanned/failed reviews but no active job.
        const { data: businessesWithWork } = await db
          .from("reviews")
          .select("business_id")
          .in("scan_status", ["unscanned", "failed"]);
        const candidateBusinessIds = [...new Set((businessesWithWork ?? []).map((r) => r.business_id))];

        for (const businessId of candidateBusinessIds) {
          // Any job still marked "running" (lease expired or not) is reused below
          // in the batch-processing loop, which refreshes its lease. Only start a
          // brand-new job when there is truly none in flight, otherwise every cron
          // tick would spawn a duplicate job for the same business. Uses a plain
          // select + length check (not .maybeSingle()) because .maybeSingle()
          // throws when more than one row matches, which silently looked like "no
          // active job" here and caused duplicate jobs to keep being created.
          const { data: activeJobs } = await db
            .from("scan_jobs")
            .select("id")
            .eq("business_id", businessId)
            .eq("status", "running")
            .limit(1);
          if (activeJobs && activeJobs.length > 0) continue;

          const { count } = await db
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId)
            .in("scan_status", ["unscanned", "failed"]);
          if (!count) continue;

          const { data: business } = await db.from("businesses").select("owner_id").eq("id", businessId).single();
          await db.from("scan_jobs").insert({
            business_id: businessId,
            created_by: business?.owner_id ?? businessId,
            total_reviews: count,
            status: "running",
            lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
          });
        }

        // Advance every job currently marked running.
        const { data: runningJobs, error: jobsError } = await db
          .from("scan_jobs")
          .select("*")
          .eq("status", "running");
        if (jobsError) {
          return Response.json({ ok: false, error: jobsError.message }, { status: 500 });
        }

        const results: { jobId: string; businessId: string; done: boolean; flagged: number; error?: string }[] = [];

        for (const job of runningJobs ?? []) {
          const { data: business } = await db.from("businesses").select("name").eq("id", job.business_id).single();

          const { data: batch, error: batchError } = await db
            .from("reviews")
            .select("id,rating,reviewer_name,review_text,review_date,locations(name)")
            .eq("business_id", job.business_id)
            .in("scan_status", ["unscanned", "failed"])
            .order("review_date", { ascending: false })
            .limit(BATCH);
          if (batchError) {
            results.push({ jobId: job.id, businessId: job.business_id, done: false, flagged: 0, error: batchError.message });
            continue;
          }

          if (!batch || batch.length === 0) {
            await db.from("scan_jobs").update({ status: "completed", lease_expires_at: null }).eq("id", job.id);
            await db.from("notifications").insert({
              user_id: job.created_by,
              business_id: job.business_id,
              type: "scan_complete",
              title: "AI scan complete",
              body: `${job.processed_reviews} reviews analyzed, ${job.flagged_reviews} potential violations found.`,
              link: "/reviews",
            });
            results.push({ jobId: job.id, businessId: job.business_id, done: true, flagged: 0 });
            continue;
          }

          await db
            .from("reviews")
            .update({ scan_status: "scanning" })
            .in("id", batch.map((r) => r.id));

          const analysis = await analyzeReviews(
            batch.map((r) => ({
              id: r.id,
              rating: r.rating,
              reviewer_name: r.reviewer_name,
              review_text: r.review_text,
              review_date: r.review_date,
              location_name: (r.locations as { name: string } | null)?.name ?? null,
            })),
            business?.name ?? "this business",
          );

          if ("error" in analysis) {
            await db
              .from("reviews")
              .update({ scan_status: "failed" })
              .in("id", batch.map((r) => r.id));
            const paused = !analysis.retryable;
            await db
              .from("scan_jobs")
              .update({
                status: paused ? "paused" : "running",
                error_message: analysis.error,
                lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
              })
              .eq("id", job.id);
            results.push({
              jobId: job.id,
              businessId: job.business_id,
              done: paused,
              flagged: 0,
              error: analysis.error,
            });
            continue;
          }

          let flagged = 0;
          for (const item of analysis.results) {
            if (!batch.some((r) => r.id === item.id)) continue;
            const category = item.violation_category;
            const isFlagged = category !== "none";
            if (isFlagged) flagged += 1;
            await db
              .from("reviews")
              .update({
                scan_status: "scanned",
                violation_category: category,
                ai_confidence: Math.min(99, Math.max(1, Math.round(item.confidence))),
                ai_explanation: item.explanation,
                ai_evidence: item.evidence,
                recommended_action: item.recommended_action,
                priority: item.priority,
                is_legitimate_negative: item.is_legitimate_negative,
                scanned_at: new Date().toISOString(),
              })
              .eq("id", item.id);

            if (item.priority === "high") {
              await db.from("notifications").insert({
                user_id: job.created_by,
                business_id: job.business_id,
                type: "high_priority",
                title: "High-priority potential violation",
                body: item.explanation.slice(0, 200),
                link: "/reviews",
              });
            }
          }

          const answered = new Set(analysis.results.map((r) => r.id));
          const skipped = batch.filter((r) => !answered.has(r.id)).map((r) => r.id);
          if (skipped.length) {
            await db
              .from("reviews")
              .update({
                scan_status: "scanned",
                violation_category: "none",
                priority: "review_required",
                ai_explanation: "The scanner could not classify this review. Human verification required.",
                ai_confidence: 0,
                scanned_at: new Date().toISOString(),
              })
              .in("id", skipped);
          }

          await db
            .from("scan_jobs")
            .update({
              processed_reviews: job.processed_reviews + batch.length,
              flagged_reviews: job.flagged_reviews + flagged,
              error_message: null,
              lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
            })
            .eq("id", job.id);

          results.push({ jobId: job.id, businessId: job.business_id, done: false, flagged });
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
