/**
 * Live Google Business Profile sync + removal outcome reconciliation (server only).
 * Uses the service-role client because OAuth tokens are never exposed to the browser.
 */
import {
  exchangeCode,
  fetchAllReviews,
  fetchGoogleEmail,
  listAccounts,
  listLocations,
  refreshAccessToken,
} from "./google.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadConnection(businessId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("google_connections")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Non-secret connection summary for the UI. */
export async function connectionStatus(businessId: string) {
  const conn = await loadConnection(businessId);
  if (!conn) return { connected: false as const };
  return {
    connected: true as const,
    googleEmail: conn.google_email,
    accountName: conn.google_account_name,
    lastSyncAt: conn.last_sync_at,
    lastSyncError: conn.last_sync_error,
  };
}

export async function saveConnection(input: {
  businessId: string;
  userId: string;
  code: string;
  redirectUri: string;
}) {
  const tokens = await exchangeCode(input.code, input.redirectUri);
  const email = await fetchGoogleEmail(tokens.access_token);
  const accounts = await listAccounts(tokens.access_token).catch(() => []);
  const db = await admin();
  const { error } = await db.from("google_connections").upsert(
    {
      business_id: input.businessId,
      connected_by: input.userId,
      google_email: email,
      google_account_name: accounts[0]?.name ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      scope: tokens.scope ?? null,
      last_sync_error: null,
    },
    { onConflict: "business_id" },
  );
  if (error) throw new Error(error.message);
}

export async function disconnect(businessId: string) {
  const db = await admin();
  const { error } = await db.from("google_connections").delete().eq("business_id", businessId);
  if (error) throw new Error(error.message);
}

async function accessTokenFor(businessId: string) {
  const conn = await loadConnection(businessId);
  if (!conn) throw new Error("No Google Business Profile account is connected for this workspace.");

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (conn.access_token && expiresAt - 60_000 > Date.now()) {
    return { token: conn.access_token, account: conn.google_account_name };
  }
  if (!conn.refresh_token) throw new Error("Google connection expired. Reconnect the Google account.");

  const refreshed = await refreshAccessToken(conn.refresh_token);
  const db = await admin();
  await db
    .from("google_connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
    })
    .eq("business_id", businessId);
  return { token: refreshed.access_token, account: conn.google_account_name };
}

/** Google locations the connected account manages, so operators can link them to workspace locations. */
export async function availableGoogleLocations(businessId: string) {
  const { token, account } = await accessTokenFor(businessId);
  const accounts = account ? [{ name: account }] : await listAccounts(token);
  const out: { name: string; title: string; address: string; account: string }[] = [];
  for (const acc of accounts) {
    const locations = await listLocations(token, acc.name);
    for (const location of locations) {
      out.push({
        name: location.name,
        title: location.title ?? location.name,
        address: [
          ...(location.storefrontAddress?.addressLines ?? []),
          location.storefrontAddress?.locality,
        ]
          .filter(Boolean)
          .join(", "),
        account: acc.name,
      });
    }
  }
  if (accounts[0] && !account) {
    const db = await admin();
    await db
      .from("google_connections")
      .update({ google_account_name: accounts[0].name })
      .eq("business_id", businessId);
  }
  return out;
}

export type SyncSummary = {
  locations: number;
  fetched: number;
  inserted: number;
  updated: number;
  disappeared: number;
  casesResolved: number;
  casesStillLive: number;
};

/** Pulls every review for each linked location, then reconciles removal outcomes. */
export async function syncBusinessReviews(businessId: string, userId: string): Promise<SyncSummary> {
  const db = await admin();
  const { token, account } = await accessTokenFor(businessId);
  const { data: locations } = await db
    .from("locations")
    .select("id,name,google_resource_name")
    .eq("business_id", businessId)
    .not("google_resource_name", "is", null);

  const linked = (locations ?? []).filter((l) => l.google_resource_name);
  if (linked.length === 0) {
    throw new Error("Link at least one workspace location to a Google location before syncing.");
  }

  const summary: SyncSummary = {
    locations: linked.length,
    fetched: 0,
    inserted: 0,
    updated: 0,
    disappeared: 0,
    casesResolved: 0,
    casesStillLive: 0,
  };
  const now = new Date().toISOString();

  try {
    for (const location of linked) {
      const resource = location.google_resource_name!;
      const acc = account ?? resource.split("/locations/")[0]!;
      const remote = await fetchAllReviews(token, acc, resource);
      summary.fetched += remote.length;

      const { data: existing } = await db
        .from("reviews")
        .select("id,google_review_name,source_review_id,rating,review_text,is_live_on_google")
        .eq("business_id", businessId)
        .eq("location_id", location.id);

      const byName = new Map(
        (existing ?? []).map((row) => [row.google_review_name ?? row.source_review_id, row]),
      );
      const seen = new Set<string>();

      for (const review of remote) {
        seen.add(review.google_review_name);
        const match = byName.get(review.google_review_name) ?? byName.get(review.source_review_id);
        if (match) {
          const changed = match.rating !== review.rating || match.review_text !== review.review_text;
          await db
            .from("reviews")
            .update({
              google_review_name: review.google_review_name,
              rating: review.rating,
              review_text: review.review_text,
              reviewer_name: review.reviewer_name,
              reviewer_profile_url: review.reviewer_profile_url,
              google_last_seen_at: now,
              is_live_on_google: true,
              removed_from_google_at: null,
              ...(changed ? { scan_status: "unscanned" as const } : {}),
            })
            .eq("id", match.id);
          summary.updated += 1;
        } else {
          const { error } = await db.from("reviews").insert({
            business_id: businessId,
            location_id: location.id,
            google_review_name: review.google_review_name,
            source_review_id: review.source_review_id,
            reviewer_name: review.reviewer_name,
            reviewer_profile_url: review.reviewer_profile_url,
            rating: review.rating,
            review_text: review.review_text,
            review_date: review.review_date,
            google_last_seen_at: now,
            is_live_on_google: true,
          });
          if (!error) summary.inserted += 1;
        }
      }

      for (const row of existing ?? []) {
        const key = row.google_review_name ?? row.source_review_id;
        if (!key || seen.has(key) || !row.google_review_name) continue;
        if (row.is_live_on_google) {
          await db
            .from("reviews")
            .update({ is_live_on_google: false, removed_from_google_at: now })
            .eq("id", row.id);
          summary.disappeared += 1;
        }
      }

      await db.from("locations").update({ google_last_sync_at: now }).eq("id", location.id);
    }

    await db
      .from("google_connections")
      .update({ last_sync_at: now, last_sync_error: null })
      .eq("business_id", businessId);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Google sync failed";
    await db.from("google_connections").update({ last_sync_error: message }).eq("business_id", businessId);
    throw new Error(message);
  }

  const outcomes = await reconcileOutcomes(businessId, userId);
  summary.casesResolved = outcomes.resolved;
  summary.casesStillLive = outcomes.stillLive;
  return summary;
}

const STILL_LIVE_AFTER_DAYS = 30;

/**
 * Removal outcome tracker: a reported review that vanished from Google is treated as
 * approved (case resolved); one still live 30+ days after reporting is flagged as still live.
 */
export async function reconcileOutcomes(businessId: string, userId: string) {
  const db = await admin();
  const now = new Date().toISOString();
  let resolved = 0;
  let stillLive = 0;

  const { data: cases } = await db
    .from("removal_cases")
    .select("id,case_number,status,outcome,reported_at,review_id,location_id")
    .eq("business_id", businessId)
    .in("status", ["evidence_ready", "reported", "appeal"]);

  for (const item of cases ?? []) {
    const { data: review } = await db
      .from("reviews")
      .select("id,is_live_on_google,removed_from_google_at,reviewer_name")
      .eq("id", item.review_id)
      .maybeSingle();
    if (!review) continue;

    if (!review.is_live_on_google) {
      await db
        .from("removal_cases")
        .update({
          status: "resolved",
          outcome: "removed_by_google",
          google_removed_at: review.removed_from_google_at ?? now,
          resolved_at: now,
          outcome_checked_at: now,
        })
        .eq("id", item.id);
      await db.from("case_events").insert({
        case_id: item.id,
        business_id: businessId,
        actor_id: userId,
        event_type: "outcome",
        message: `Google removed the review from ${review.reviewer_name}. Case marked resolved automatically.`,
      });
      await db.from("notifications").insert({
        user_id: userId,
        business_id: businessId,
        type: "case_resolved",
        title: `Case #${item.case_number} approved by Google`,
        body: `The reported review from ${review.reviewer_name} is no longer live on Google.`,
        link: "/cases",
      });
      resolved += 1;
      continue;
    }

    const reportedAt = item.reported_at ? new Date(item.reported_at).getTime() : null;
    const overdue =
      reportedAt !== null && Date.now() - reportedAt > STILL_LIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    const nextOutcome = overdue ? "still_live" : "pending";
    if (item.outcome !== nextOutcome) {
      await db
        .from("removal_cases")
        .update({ outcome: nextOutcome, outcome_checked_at: now })
        .eq("id", item.id);
      if (overdue) {
        await db.from("case_events").insert({
          case_id: item.id,
          business_id: businessId,
          actor_id: userId,
          event_type: "outcome",
          message: `Review still live on Google ${STILL_LIVE_AFTER_DAYS}+ days after reporting — consider an appeal.`,
        });
        stillLive += 1;
      }
    } else {
      await db.from("removal_cases").update({ outcome_checked_at: now }).eq("id", item.id);
    }
  }

  return { resolved, stillLive };
}
