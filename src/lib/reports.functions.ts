import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type BusinessReport = {
  totals: {
    reviews: number;
    avg_rating: number;
    negative: number;
    scanned: number;
    unscanned: number;
    flagged: number;
    high_priority: number;
    removed: number;
  };
  rating_distribution: Record<string, number>;
  violation_distribution: Record<string, number>;
  monthly: { month: string; reviews: number; avg_rating: number; negative: number; flagged: number }[];
  cases: {
    total: number;
    resolved: number;
    rejected: number;
    appeal: number;
    reported: number;
    removed_by_google: number;
    still_live: number;
    by_status: Record<string, number>;
    avg_days_to_resolve: number;
  };
  locations: {
    id: string;
    name: string;
    reviews: number;
    avg_rating: number;
    negative: number;
    flagged: number;
    cases: number;
    resolved_cases: number;
  }[];
};

/**
 * Whole-workspace analytics computed inside Postgres so the browser never
 * loads tens of thousands of review rows to draw a chart.
 */
export const getBusinessReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        days: z.number().int().min(1).max(3650).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const since = data.days ? new Date(Date.now() - data.days * 86_400_000).toISOString() : null;
    const { data: report, error } = await context.supabase.rpc("business_report", {
      _business_id: data.businessId,
      _since: since ?? undefined,
    });
    if (error) throw new Error(error.message);
    return report as unknown as BusinessReport;
  });
