import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getBusinessReport } from "@/lib/reports.functions";
import { useWorkspace } from "@/components/workspace";
import { BusinessGate } from "@/components/business-gate";
import { EmptyState, ErrorBlock, KpiCard, LoadingBlock, PageHeader, Panel } from "@/components/ui-kit";
import { CategoryBadge } from "@/components/badges";
import {
  CASE_STATUS_LABELS,
  VIOLATION_ORDER,
  type CaseStatus,
  type ViolationCategory,
} from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Reputation analytics — OrbitRep" },
      {
        name: "description",
        content:
          "Rating distribution, violation mix, location benchmarking and removal outcomes across your Google review portfolio.",
      },
      { property: "og:title", content: "Reputation analytics — OrbitRep" },
      {
        property: "og:description",
        content: "Deep analytics on review sentiment, violations and removal case outcomes.",
      },
    ],
  }),
  component: () => (
    <BusinessGate>
      <AnalyticsPage />
    </BusinessGate>
  ),
});

function AnalyticsPage() {
  const { activeBusiness } = useWorkspace();
  const businessId = activeBusiness?.id ?? "";
  const fetchReport = useServerFn(getBusinessReport);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["report", businessId, "all"],
    queryFn: () => fetchReport({ data: { businessId, days: null } }),
    enabled: Boolean(businessId),
    staleTime: 60_000,
  });

  const model = useMemo(() => {
    const totals = data?.totals;
    const total = totals?.reviews ?? 0;
    const ratings = data?.rating_distribution ?? {};
    const violations = data?.violation_distribution ?? {};
    const caseStats = data?.cases;

    const ratingBuckets = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: Number(ratings[String(rating)] ?? 0),
    }));

    const violationCounts = VIOLATION_ORDER.map((category) => ({
      category,
      count: Number(violations[category] ?? 0),
    })).filter((row) => row.count > 0 && row.category !== "none");

    const byLocation = (data?.locations ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      reviews: Number(row.reviews),
      avg: Number(row.avg_rating),
      flagged: Number(row.flagged),
      cases: Number(row.cases),
      removed: Number(row.resolved_cases),
    }));

    const volume = (data?.monthly ?? []).slice(-12).map((row) => ({
      month: row.month,
      count: Number(row.reviews),
      negative: Number(row.negative),
      avg: Number(row.avg_rating),
    }));

    const resolved = caseStats?.resolved ?? 0;
    const closed = resolved + (caseStats?.rejected ?? 0);

    return {
      total,
      avg: Number(totals?.avg_rating ?? 0),
      ratingBuckets,
      violationCounts,
      byLocation,
      volume,
      statusCounts: caseStats?.by_status ?? {},
      successRate: closed ? Math.round((resolved / closed) * 100) : 0,
      totalCases: caseStats?.total ?? 0,
      legit: totals?.legitimate_negative ?? 0,
      flagged: totals?.flagged ?? 0,
    };
  }, [data]);

  if (isLoading) return <LoadingBlock label="Building analytics" />;
  if (error) return <ErrorBlock message={(error as Error).message} retry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="analytics"
        title="Reputation analytics"
        subtitle={`Portfolio-wide signal for ${(activeBusiness?.name ?? "your workspace")}: sentiment, violation mix and removal outcomes.`}
      />

      {model.total === 0 ? (
        <EmptyState
          icon="analytics"
          title="No data to analyse yet"
          description="Import reviews first — analytics is generated from your live review and case data, never sample content."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Reviews analysed" value={model.total} icon="reviews" />
            <KpiCard label="Average rating" value={model.avg.toFixed(2)} tone="success" icon="analytics" />
            <KpiCard
              label="Violation rate"
              value={`${model.total ? Math.round((model.flagged / model.total) * 100) : 0}%`}
              tone="danger"
              icon="scanner"
              hint={`${model.flagged} flagged reviews`}
            />
            <KpiCard
              label="Removal success"
              value={`${model.successRate}%`}
              tone="neon"
              icon="cases"
              hint={`${model.totalCases} total cases`}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel className="p-5">
              <h2 className="font-display text-lg font-semibold">Rating distribution</h2>
              <ul className="mt-4 space-y-3">
                {model.ratingBuckets
                  .slice()
                  .reverse()
                  .map((bucket) => {
                    const pct = model.total ? (bucket.count / model.total) * 100 : 0;
                    return (
                      <li key={bucket.rating}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="tabular-nums">{bucket.rating}★</span>
                          <span className="tabular-nums text-muted-foreground">
                            {bucket.count} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet to-neon"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </Panel>

            <Panel className="p-5">
              <h2 className="font-display text-lg font-semibold">Violation mix</h2>
              <p className="text-xs text-muted-foreground">Detected policy categories across scanned reviews</p>
              {model.violationCounts.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No policy violations detected yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {model.violationCounts.map((row) => {
                    const pct = model.flagged ? (row.count / model.flagged) * 100 : 0;
                    return (
                      <li key={row.category}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <CategoryBadge category={row.category as ViolationCategory} />
                          <span className="tabular-nums text-muted-foreground">{row.count}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-magenta to-violet"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <Panel className="mt-4 p-5">
            <h2 className="font-display text-lg font-semibold">Volume &amp; negativity by month</h2>
            <VolumeChart points={model.volume} />
          </Panel>

          <Panel className="mt-4 p-5">
            <h2 className="font-display text-lg font-semibold">Case outcomes</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
              {(Object.keys(CASE_STATUS_LABELS) as CaseStatus[]).map((status) => (
                <div key={status} className="rounded-xl border border-border/60 bg-surface-2 p-3">
                  <p className="text-2xl font-bold tabular-nums">{model.statusCounts[status] ?? 0}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{CASE_STATUS_LABELS[status]}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="mt-4 overflow-hidden">
            <div className="border-b border-border/60 p-5">
              <h2 className="font-display text-lg font-semibold">Location benchmark</h2>
              <p className="text-xs text-muted-foreground">Compare performance across every managed location</p>
            </div>
            {model.byLocation.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No locations created yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Reviews</th>
                      <th className="px-4 py-3">Avg rating</th>
                      <th className="px-4 py-3">Flagged</th>
                      <th className="px-4 py-3">Cases</th>
                      <th className="px-4 py-3">Removed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.byLocation.map((row) => (
                      <tr key={row.id} className="border-t border-border/50">
                        <td className="px-4 py-3 font-medium">{row.name}</td>
                        <td className="px-4 py-3 tabular-nums">{row.reviews}</td>
                        <td className="px-4 py-3 tabular-nums">{row.avg ? row.avg.toFixed(2) : "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-danger">{row.flagged}</td>
                        <td className="px-4 py-3 tabular-nums">{row.cases}</td>
                        <td className="px-4 py-3 tabular-nums text-success">{row.removed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function VolumeChart({ points }: { points: { month: string; count: number; negative: number }[] }) {
  if (points.length === 0)
    return <p className="py-12 text-center text-sm text-muted-foreground">No history yet.</p>;
  const max = Math.max(...points.map((point) => point.count), 1);

  return (
    <div className="mt-5 flex items-end gap-2 overflow-x-auto pb-2">
      {points.map((point) => (
        <div key={point.month} className="flex min-w-[44px] flex-1 flex-col items-center gap-2">
          <div className="flex h-40 w-full items-end justify-center gap-1">
            <div
              className="w-1/2 rounded-t-md bg-gradient-to-t from-violet to-neon"
              style={{ height: `${(point.count / max) * 100}%` }}
              title={`${point.count} reviews`}
            />
            <div
              className="w-1/3 rounded-t-md bg-danger/70"
              style={{ height: `${(point.negative / max) * 100}%` }}
              title={`${point.negative} negative (1–2★)`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{point.month.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}
