import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { draftReviewResponse } from "./review-analysis.server";

const TONES = ["professional", "empathetic", "concise", "warm", "formal"] as const;

/** All saved responses for one review, newest first. */
export const listReviewResponses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reviewId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("review_responses")
      .select("*")
      .eq("review_id", data.reviewId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Workspace-wide response tracker feed with status filter + pagination. */
export const listWorkspaceResponses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        status: z.enum(["all", "draft", "approved", "sent"]).default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(25),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    let query = context.supabase
      .from("review_responses")
      .select("*, reviews(id,reviewer_name,rating,review_text,review_date,locations(name))", {
        count: "exact",
      })
      .eq("business_id", data.businessId);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);

    const { data: all } = await context.supabase
      .from("review_responses")
      .select("status")
      .eq("business_id", data.businessId);
    const counts = { draft: 0, approved: 0, sent: 0, total: (all ?? []).length };
    for (const row of all ?? []) counts[row.status as "draft" | "approved" | "sent"] += 1;

    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize, counts };
  });

/** Generates a fresh AI reply and stores it as a draft so it can be tracked. */
export const createResponseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reviewId: z.string().uuid(),
        tone: z.enum(TONES).default("professional"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: review, error } = await supabase
      .from("reviews")
      .select("id,business_id,reviewer_name,rating,review_text,businesses(name)")
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

    const { data: saved, error: insertError } = await supabase
      .from("review_responses")
      .insert({
        business_id: review.business_id,
        review_id: review.id,
        created_by: userId,
        tone: data.tone,
        draft_text: result.response,
        status: "draft",
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);
    return saved;
  });

/** Saves operator edits to a draft/approved reply (sent replies are locked). */
export const updateResponseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), text: z.string().min(1).max(5000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("review_responses")
      .update({ draft_text: data.text })
      .eq("id", data.id)
      .neq("status", "sent")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This reply has already been sent and can no longer be edited.");
    return row;
  });

/** Approves (or reverts to draft) a reply. */
export const setResponseApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), approved: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("review_responses")
      .update(
        data.approved
          ? { status: "approved", approved_at: new Date().toISOString(), approved_by: context.userId }
          : { status: "draft", approved_at: null, approved_by: null },
      )
      .eq("id", data.id)
      .neq("status", "sent")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This reply has already been sent.");
    return row;
  });

/**
 * Marks an approved reply as sent. With `channel: "google"` the reply is published
 * straight to Google Business Profile; "manual" records that the operator posted it.
 */
export const markResponseSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), channel: z.enum(["google", "manual"]).default("manual") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("review_responses")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.status === "sent") return row;
    if (row.status !== "approved") throw new Error("Approve the reply before marking it as sent.");

    let posted = false;
    let googleError: string | null = null;
    if (data.channel === "google") {
      const { publishReviewReply } = await import("./google-sync.server");
      try {
        await publishReviewReply(row.business_id, row.review_id, row.draft_text);
        posted = true;
      } catch (caught) {
        googleError = caught instanceof Error ? caught.message : "Google rejected the reply.";
        await supabase.from("review_responses").update({ google_error: googleError }).eq("id", row.id);
        throw new Error(googleError);
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("review_responses")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_by: userId,
        sent_channel: data.channel,
        posted_to_google: posted,
        google_error: null,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    return updated;
  });

export const deleteResponseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("review_responses")
      .delete()
      .eq("id", data.id)
      .neq("status", "sent");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
