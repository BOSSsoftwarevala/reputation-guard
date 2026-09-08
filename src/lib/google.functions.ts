import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const businessInput = (input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input);

/** Throws unless the caller can access the workspace (RLS-backed check). */
async function assertAccess(
  supabase: { from: (t: "businesses") => any },
  businessId: string,
) {
  const { data, error } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("You do not have access to this workspace.");
}

function callbackUrl() {
  const request = getRequest();
  const url = new URL(request.url);
  // Behind nginx the raw request URL is always http://, so trust the
  // forwarded proto/host headers to build the public-facing callback URL —
  // otherwise Google rejects the OAuth redirect_uri as a mismatch.
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  return `${proto}://${host}/api/public/google/callback`;
}

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(businessInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.businessId);
    const { connectionStatus } = await import("./google-sync.server");
    return connectionStatus(data.businessId);
  });

export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(businessInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.businessId);
    const { buildAuthUrl, signState } = await import("./google.server");
    const state = signState({
      businessId: data.businessId,
      userId: context.userId,
      redirectTo: "/locations",
    });
    return { url: buildAuthUrl(callbackUrl(), state) };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(businessInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.businessId);
    const { disconnect } = await import("./google-sync.server");
    await disconnect(data.businessId);
    return { ok: true };
  });

export const listGoogleLocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(businessInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.businessId);
    const { availableGoogleLocations } = await import("./google-sync.server");
    return availableGoogleLocations(data.businessId);
  });

export const linkGoogleLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        locationId: z.string().uuid(),
        googleResourceName: z.string().max(300).nullable(),
      })
      .parse(input))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.businessId);
    const { error } = await context.supabase
      .from("locations")
      .update({ google_resource_name: data.googleResourceName })
      .eq("id", data.locationId)
      .eq("business_id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncGoogleReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(businessInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.businessId);
    const { syncBusinessReviews } = await import("./google-sync.server");
    return syncBusinessReviews(data.businessId, context.userId);
  });

export const checkRemovalOutcomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(businessInput)
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, data.businessId);
    const { reconcileOutcomes } = await import("./google-sync.server");
    return reconcileOutcomes(data.businessId, context.userId);
  });
