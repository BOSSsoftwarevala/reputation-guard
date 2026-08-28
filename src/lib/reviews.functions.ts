import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { analyzeReviews, draftReviewResponse } from "./review-analysis.server";

/** Paginated, filtered, sorted review feed for one business. */
export const listReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(25),
        search: z.string().max(200).optional(),
        locationId: z.string().uuid().nullable().optional(),
        priority: z.string().optional(),
        category: z.string().optional(),
        scanStatus: z.string().optional(),
        rating: z.number().int().min(1).max(5).nullable().optional(),
        hasCase: z.enum(["any", "yes", "no"]).default("any"),
        sortBy: z.enum(["review_date", "rating", "ai_confidence", "priority"]).default("review_date"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.pageSize;

    let query = supabase
      .from("reviews")
      .select("*, locations(name), removal_cases(id,status)", { count: "exact" })
      .eq("business_id", data.businessId);

    if (data.search) {
      const escaped = data.search.replace(/[%,()]/g, " ").trim();
      if (escaped) query = query.or(`review_text.ilike.%${escaped}%,reviewer_name.ilike.%${escaped}%`);
    }
    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.priority && data.priority !== "all")
      query = query.eq("priority", data.priority as never);
    if (data.category && data.category !== "all")
      query = query.eq("violation_category", data.category as never);
    if (data.scanStatus && data.scanStatus !== "all")
      query = query.eq("scan_status", data.scanStatus as never);
    if (data.rating) query = query.eq("rating", data.rating);

    query = query
      .order(data.sortBy, { ascending: data.sortDir === "asc", nullsFirst: false })
      .range(from, from + data.pageSize - 1);

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    const filtered = (rows ?? []).filter((row) => {
      const hasCase = Array.isArray(row.removal_cases) && row.removal_cases.length > 0;
      if (data.hasCase === "yes") return hasCase;
      if (data.hasCase === "no") return !hasCase;
      return true;
    });

    return { rows: filtered, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

/** Imports a batch of real review records supplied by the operator (CSV/JSON export or API sync). */
export const importReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        defaultLocationId: z.string().uuid().nullable().optional(),
        reviews: z
          .array(
            z.object({
              source_review_id: z.string().max(200).optional(),
              reviewer_name: z.string().max(160).optional(),
              reviewer_profile_url: z.string().max(400).optional(),
              rating: z.number().int().min(1).max(5),
              review_text: z.string().max(6000).optional(),
              review_date: z.string().optional(),
              location_name: z.string().max(160).optional(),
            }),
          )
          .min(1)
          .max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: locations } = await supabase
      .from("locations")
      .select("id,name")
      .eq("business_id", data.businessId);

    const byName = new Map((locations ?? []).map((l) => [l.name.trim().toLowerCase(), l.id]));

    const payload = data.reviews.map((r, index) => {
      const parsedDate = r.review_date ? new Date(r.review_date) : null;
      const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date();
      return {
        business_id: data.businessId,
        location_id:
          (r.location_name ? byName.get(r.location_name.trim().toLowerCase()) : null) ??
          data.defaultLocationId ??
          null,
        source_review_id:
          r.source_review_id?.trim() ||
          `${validDate.toISOString().slice(0, 10)}-${(r.reviewer_name ?? "anon").slice(0, 24)}-${r.rating}-${index}`,
        reviewer_name: r.reviewer_name?.trim() || "Anonymous",
        reviewer_profile_url: r.reviewer_profile_url ?? null,
        rating: r.rating,
        review_text: r.review_text ?? "",
        review_date: validDate.toISOString(),
      };
    });

    const { data: inserted, error } = await supabase
      .from("reviews")
      .upsert(payload, { onConflict: "business_id,source_review_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    const importedCount = inserted?.length ?? 0;
    await supabase.from("notifications").insert({
      user_id: userId,
      business_id: data.businessId,
      type: "import_complete",
      title: `${importedCount} review${importedCount === 1 ? "" : "s"} imported`,
      body: `${data.reviews.length - importedCount} duplicate record(s) skipped.`,
      link: "/reviews",
    });

    return { imported: importedCount, received: data.reviews.length };
  });

/** Creates (or reuses) a bounded scan job with a single-flight lease. */
export const startScanJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: z.string().uuid(), rescanAll: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("scan_jobs")
      .select("*")
      .eq("business_id", data.businessId)
      .eq("status", "running")
      .gt("lease_expires_at", new Date().toISOString())
      .maybeSingle();
    if (existing) return existing;

    let countQuery = supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("business_id", data.businessId);
    if (!data.rescanAll) countQuery = countQuery.in("scan_status", ["unscanned", "failed"]);
    const { count } = await countQuery;

    if (data.rescanAll) {
      await supabase
        .from("reviews")
        .update({ scan_status: "unscanned" })
        .eq("business_id", data.businessId);
    }

    const { data: job, error } = await supabase
      .from("scan_jobs")
      .insert({
        business_id: data.businessId,
        created_by: userId,
        total_reviews: count ?? 0,
        status: "running",
        lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return job;
  });

/**
 * Processes ONE bounded batch of a scan job. The client polls this so large
 * scans never block the UI, and every processed review is persisted before
 * the next batch is requested.
 */
export const processScanBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const BATCH = 8;

    const { data: job, error: jobError } = await supabase
      .from("scan_jobs")
      .select("*")
      .eq("id", data.jobId)
      .single();
    if (jobError) throw new Error(jobError.message);
    if (job.status !== "running") {
      return { done: true, job, flagged: 0, message: `Job is ${job.status}.` };
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("name")
      .eq("id", job.business_id)
      .single();

    const { data: batch, error: batchError } = await supabase
      .from("reviews")
      .select("id,rating,reviewer_name,review_text,review_date,locations(name)")
      .eq("business_id", job.business_id)
      .in("scan_status", ["unscanned", "failed"])
      .order("review_date", { ascending: false })
      .limit(BATCH);
    if (batchError) throw new Error(batchError.message);

    if (!batch || batch.length === 0) {
      const { data: finished } = await supabase
        .from("scan_jobs")
        .update({ status: "completed", lease_expires_at: null })
        .eq("id", job.id)
        .select()
        .single();
      await supabase.from("notifications").insert({
        user_id: userId,
        business_id: job.business_id,
        type: "scan_complete",
        title: "AI scan complete",
        body: `${job.processed_reviews} reviews analyzed, ${job.flagged_reviews} potential violations found.`,
        link: "/reviews",
      });
      return { done: true, job: finished ?? job, flagged: 0 };
    }

    await supabase
      .from("reviews")
      .update({ scan_status: "scanning" })
      .in(
        "id",
        batch.map((r) => r.id),
      );

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
      await supabase
        .from("reviews")
        .update({ scan_status: "failed" })
        .in(
          "id",
          batch.map((r) => r.id),
        );
      const paused = !analysis.retryable;
      const { data: updated } = await supabase
        .from("scan_jobs")
        .update({
          status: paused ? "paused" : "running",
          error_message: analysis.error,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        })
        .eq("id", job.id)
        .select()
        .single();
      return { done: paused, job: updated ?? job, flagged: 0, error: analysis.error };
    }

    let flagged = 0;
    for (const item of analysis.results) {
      if (!batch.some((r) => r.id === item.id)) continue;
      const category = item.violation_category;
      const isFlagged = category !== "none";
      if (isFlagged) flagged += 1;
      await supabase
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
        await supabase.from("notifications").insert({
          user_id: userId,
          business_id: job.business_id,
          type: "high_priority",
          title: "High-priority potential violation",
          body: item.explanation.slice(0, 200),
          link: "/reviews",
        });
      }
    }

    // Any review the model skipped is marked scanned-with-no-finding rather than looping forever.
    const answered = new Set(analysis.results.map((r) => r.id));
    const skipped = batch.filter((r) => !answered.has(r.id)).map((r) => r.id);
    if (skipped.length) {
      await supabase
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

    const { data: updatedJob } = await supabase
      .from("scan_jobs")
      .update({
        processed_reviews: job.processed_reviews + batch.length,
        flagged_reviews: job.flagged_reviews + flagged,
        error_message: null,
        lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq("id", job.id)
      .select()
      .single();

    return { done: false, job: updatedJob ?? job, flagged };
  });

export const getActiveScanJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase
      .from("scan_jobs")
      .select("*")
      .eq("business_id", data.businessId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return job ?? null;
  });

export const cancelScanJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scan_jobs")
      .update({ status: "completed", lease_expires_at: null })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkUpdateReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        priority: z.string().optional(),
        category: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Database["public"]["Tables"]["reviews"]["Update"] = {};
    if (data.priority) patch.priority = data.priority as Database["public"]["Enums"]["review_priority"];
    if (data.category)
      patch.violation_category = data.category as Database["public"]["Enums"]["violation_category"];
    if (Object.keys(patch).length === 0) return { updated: 0 };
    const { error, count } = await context.supabase
      .from("reviews")
      .update(patch, { count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { updated: count ?? 0 };
  });

export const generateResponseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reviewId: z.string().uuid(),
        tone: z.enum(["professional", "empathetic", "concise", "warm", "formal"]).default("professional"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: review, error } = await supabase
      .from("reviews")
      .select("*, businesses(name)")
      .eq("id", data.reviewId)
      .single();
    if (error) throw new Error(error.message);

    const result = await draftReviewResponse({
      businessName: (review.businesses as { name: string } | null)?.name ?? "our business",
      reviewerName: review.reviewer_name,
      rating: review.rating,
      reviewText: review.review_text,
      tone: data.tone,
    });
    if ("error" in result) throw new Error(result.error);
    return result;
  });

export const getBusinessStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("id,rating,review_date,priority,scan_status,violation_category,location_id,is_legitimate_negative")
      .eq("business_id", data.businessId)
      .order("review_date", { ascending: true })
      .limit(20000);
    if (error) throw new Error(error.message);

    const { data: cases } = await supabase
      .from("removal_cases")
      .select("id,status,created_at,location_id")
      .eq("business_id", data.businessId);

    const { data: locations } = await supabase
      .from("locations")
      .select("id,name")
      .eq("business_id", data.businessId);

    return { reviews: reviews ?? [], cases: cases ?? [], locations: locations ?? [] };
  });
