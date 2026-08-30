import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const listCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        status: z.string().optional(),
        search: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("removal_cases")
      .select("*, reviews(reviewer_name,rating,review_text,review_date,ai_confidence,priority), locations(name)")
      .eq("business_id", data.businessId)
      .order("created_at", { ascending: false });
    if (data.status && data.status !== "all") query = query.eq("status", data.status as never);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const search = data.search?.trim().toLowerCase();
    const filtered = search
      ? (rows ?? []).filter((row) => {
          const review = row.reviews as { reviewer_name?: string; review_text?: string } | null;
          return (
            String(row.case_number).includes(search) ||
            (review?.reviewer_name ?? "").toLowerCase().includes(search) ||
            (review?.review_text ?? "").toLowerCase().includes(search)
          );
        })
      : (rows ?? []);
    return filtered;
  });

export const getCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ caseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("removal_cases")
      .select("*, reviews(*), locations(name,address,city,country,google_place_id), businesses(name,industry,website)")
      .eq("id", data.caseId)
      .single();
    if (error) throw new Error(error.message);
    const { data: events } = await supabase
      .from("case_events")
      .select("*")
      .eq("case_id", data.caseId)
      .order("created_at", { ascending: true });
    return { case: row, events: events ?? [] };
  });

export const createCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reviewId: z.string().uuid(), notes: z.string().max(4000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("*")
      .eq("id", data.reviewId)
      .single();
    if (reviewError) throw new Error(reviewError.message);

    const { data: existing } = await supabase
      .from("removal_cases")
      .select("id")
      .eq("review_id", data.reviewId)
      .maybeSingle();
    if (existing) return existing;

    const evidence = Array.isArray(review.ai_evidence) ? review.ai_evidence : [];
    const { data: created, error } = await supabase
      .from("removal_cases")
      .insert({
        business_id: review.business_id,
        review_id: review.id,
        location_id: review.location_id,
        violation_category: review.violation_category ?? "other",
        evidence,
        notes: data.notes ?? null,
        created_by: userId,
        assigned_to: userId,
        status: "new",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("case_events").insert({
      case_id: created.id,
      business_id: created.business_id,
      actor_id: userId,
      event_type: "created",
      message: "Removal case opened from flagged review.",
    });
    await supabase.from("notifications").insert({
      user_id: userId,
      business_id: created.business_id,
      type: "case_created",
      title: `Case #${created.case_number} opened`,
      body: review.ai_explanation ?? "A removal case was created.",
      link: "/cases",
    });
    return created;
  });

export const updateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        status: z
          .enum(["new", "reviewing", "evidence_ready", "reported", "appeal", "resolved", "rejected"])
          .optional(),
        notes: z.string().max(4000).nullable().optional(),
        assigned_to: z.string().uuid().nullable().optional(),
        evidence: z.array(z.string().max(600)).max(40).optional(),
        message: z.string().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Database["public"]["Tables"]["removal_cases"]["Update"] = {};
    if (data.status) {
      patch.status = data.status;
      if (data.status === "reported") patch.reported_at = new Date().toISOString();
      if (data.status === "appeal") patch.appealed_at = new Date().toISOString();
      if (data.status === "resolved" || data.status === "rejected")
        patch.resolved_at = new Date().toISOString();
    }
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    if (data.evidence) patch.evidence = data.evidence;

    const { data: updated, error } = await supabase
      .from("removal_cases")
      .update(patch)
      .eq("id", data.caseId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("case_events").insert({
      case_id: updated.id,
      business_id: updated.business_id,
      actor_id: userId,
      event_type: data.status ? `status:${data.status}` : "updated",
      message: data.message ?? (data.status ? `Status changed to ${data.status}.` : "Case details updated."),
    });

    if (data.status) {
      await supabase.from("notifications").insert({
        user_id: userId,
        business_id: updated.business_id,
        type: data.status === "appeal" ? "appeal_update" : "case_status",
        title: `Case #${updated.case_number} → ${data.status.replace("_", " ")}`,
        body: data.message ?? null,
        link: "/cases",
      });
    }
    return updated;
  });

export const addCaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ caseId: z.string().uuid(), message: z.string().min(1).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: caseError } = await supabase
      .from("removal_cases")
      .select("business_id")
      .eq("id", data.caseId)
      .single();
    if (caseError) throw new Error(caseError.message);
    const { error } = await supabase.from("case_events").insert({
      case_id: data.caseId,
      business_id: row.business_id,
      actor_id: userId,
      event_type: "note",
      message: data.message,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Opens removal cases for many flagged reviews at once (bulk triage). */
export const createCasesBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reviewIds: z.array(z.string().uuid()).min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("*")
      .in("id", data.reviewIds);
    if (error) throw new Error(error.message);

    const { data: existing } = await supabase
      .from("removal_cases")
      .select("review_id")
      .in("review_id", data.reviewIds);
    const already = new Set((existing ?? []).map((row) => row.review_id));

    const pending = (reviews ?? []).filter((review) => !already.has(review.id));
    if (pending.length === 0) return { created: 0, skipped: data.reviewIds.length };

    const { data: created, error: insertError } = await supabase
      .from("removal_cases")
      .insert(
        pending.map((review) => ({
          business_id: review.business_id,
          review_id: review.id,
          location_id: review.location_id,
          violation_category: review.violation_category ?? "other",
          evidence: Array.isArray(review.ai_evidence) ? review.ai_evidence : [],
          created_by: userId,
          assigned_to: userId,
          status: "new" as const,
        })),
      )
      .select();
    if (insertError) throw new Error(insertError.message);

    await supabase.from("case_events").insert(
      (created ?? []).map((row) => ({
        case_id: row.id,
        business_id: row.business_id,
        actor_id: userId,
        event_type: "created",
        message: "Removal case opened from bulk triage.",
      })),
    );

    const businessId = created?.[0]?.business_id;
    if (businessId) {
      await supabase.from("notifications").insert({
        user_id: userId,
        business_id: businessId,
        type: "case_created",
        title: `${created!.length} removal cases opened`,
        body: "Bulk triage created cases from flagged reviews.",
        link: "/cases",
      });
    }
    return { created: created?.length ?? 0, skipped: data.reviewIds.length - pending.length };
  });
