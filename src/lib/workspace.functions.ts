import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Returns every business the caller can access, with locations. Creates nothing. */
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: businesses, error } = await supabase
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (businesses ?? []).map((b) => b.id);
    const [{ data: locations }, { data: members }, { data: profile }] = await Promise.all([
      ids.length
        ? supabase.from("locations").select("*").in("business_id", ids).order("name")
        : Promise.resolve({ data: [] as never[] }),
      ids.length
        ? supabase.from("business_members").select("*").in("business_id", ids)
        : Promise.resolve({ data: [] as never[] }),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    ]);

    return {
      userId,
      profile: profile ?? null,
      businesses: businesses ?? [],
      locations: locations ?? [],
      members: members ?? [],
    };
  });

export const createBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        industry: z.string().max(80).nullable().optional(),
        website: z.string().max(200).nullable().optional(),
      })
      .parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: business, error } = await supabase
      .from("businesses")
      .insert({
        owner_id: userId,
        name: data.name,
        industry: data.industry ?? null,
        website: data.website ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("business_members").insert({
      business_id: business.id,
      user_id: userId,
      role: "admin",
    });
    return business;
  });

export const upsertLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        business_id: z.string().uuid(),
        name: z.string().min(1).max(120),
        address: z.string().max(240).nullable().optional(),
        city: z.string().max(120).nullable().optional(),
        country: z.string().max(120).nullable().optional(),
        google_place_id: z.string().max(200).nullable().optional(),
      })
      .parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      business_id: data.business_id,
      name: data.name,
      address: data.address ?? null,
      city: data.city ?? null,
      country: data.country ?? null,
      google_place_id: data.google_place_id ?? null,
    };
    const query = data.id
      ? supabase.from("locations").update(payload).eq("id", data.id).select().single()
      : supabase.from("locations").insert(payload).select().single();
    const { data: location, error } = await query;
    if (error) throw new Error(error.message);
    return location;
  });

export const deleteLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("locations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    if (data.ids?.length) query = query.in("id", data.ids);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
