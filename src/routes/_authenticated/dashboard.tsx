import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { getBusinessStats } from "@/lib/reviews.functions";
import { useWorkspace } from "@/components/workspace";
import { BusinessGate } from "@/components/business-gate";
import { EmptyState, ErrorBlock, KpiCard, LoadingBlock, PageHeader, Panel } from "@/components/ui-kit";
import { PriorityBadge } from "@/components/badges";
import { CASE_STATUS_LABELS, type CaseStatus, type ReviewPriority } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Command center — OrbitRep" },
      {
        name: "description",
        content: "Live reputation KPIs: flagged reviews, open removal cases, rating trend and scan coverage.",
      },
      { property: "og:title", content: "Command center — OrbitRep" },
      { property: "og:description", content: "Live Google review reputation KPIs and removal case pipeline." },
    ],
  }),
  component: () => (
    <BusinessGate>
      <DashboardPage />
    </BusinessGate>
  ),
});

function DashboardPage() {
  const { activeBusiness } = useWorkspace();
  const fetchStats = useServerFn(getBusinessStats);
  const businessId = activeBusiness?.id ?? "";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stats", businessId],
    queryFn: () => fetchStats({ data: { businessId } }),
  });

  const derived = useMemo(() => {
    const reviews = data?.reviews ?? [];
    const cases = data?.cases ?? [];
    const total = reviews.length;
    const avg = total ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    const flagged = reviews.filter(
      (r) => r.violation_category && r.violation_category !== "none",
    ).length;
    const scanned = reviews.filter((r) => r.scan_status === "scanned").length;
    const priorityCounts: Record<ReviewPriority, number> = {
      high: 0,
      medium: 0,
      review_required: 0,
      normal: 0,
    };
    for (const review of reviews) priorityCounts[review.priority as ReviewPriority]++;

    const statusCounts = cases.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
    const resolved = cases.filter((c) => c.status === "resolved").length;
    const closed = cases.filter((c) => c.status === "resolved" || c.status === "rejected").length;

    const months = new Map<string, { sum: number; count: number }>();
    for (const review of reviews) {
      const key = String(review.review_date).slice(0, 7);
      const bucket = months.get(key) ?? { sum: 0, count: 0 };
      bucket.sum += review.rating;
      bucket.count += 1;
      months.set(key, bucket);
    }
    const trend = Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, bucket]) => ({ month, avg: bucket.sum / bucket.count, count: bucket.count }));

    return {
      total,
      avg,
      flagged,
      scanned,
      priorityCounts,
      statusCounts,
      openCases: cases.length - closed,
      totalCases: cases.length,
      successRate: closed ? Math.round((resolved / closed) * 100) : 0,
      trend,
    };
  }, [data]);

  if (isLoading) return <LoadingBlock label="Crunching reputation data" />;
  if (error) return <ErrorBlock message={(error as Error).message} retry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        icon="dashboard"
        title="Command center"
        subtitle={`Reputation intelligence for ${(activeBusiness?.name ?? "your workspace")}.`}
        actions={
          <>
            <Link
              to="/scanner"
              className="rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground hover:neon-outline"
            >
              Run AI scan
            </Link>
            <Link to="/reviews" className="glass rounded-xl px-4 py-2 text-sm font-medium">
              Review feed
            </Link>
          </>
        }
      />

      {derived.total === 0 ? (
        <EmptyState
          icon="reviews"
          title="No reviews imported yet"
          description="Import your Google review export (CSV or JSON) to start detecting policy violations and building removal cases."
          action={
            <Link
              to="/reviews"
              className="mt-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Import reviews
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total reviews" value={derived.total} icon="reviews" hint={`${derived.scanned} scanned by AI`} />
            <KpiCard
              label="Average rating"
              value={derived.avg.toFixed(2)}
              tone="success"
              icon="analytics"
              hint="Across all imported reviews"
            />
            <KpiCard
              label="Policy violations"
              value={derived.flagged}
              tone="danger"
              icon="scanner"
              hint={`${derived.priorityCounts.high} high priority`}
            />
            <KpiCard
              label="Removal success"
              value={`${derived.successRate}%`}
              tone="neon"
              icon="cases"
              hint={`${derived.openCases} cases still open`}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Panel className="p-5 lg:col-span-2">
              <h2 className="font-display text-lg font-semibold">Rating trend</h2>
              <p className="text-xs text-muted-foreground">Monthly average rating, last 12 months</p>
              <TrendChart points={derived.trend} />
            </Panel>

            <Panel className="p-5">
              <h2 className="font-display text-lg font-semibold">Triage queue</h2>
              <p className="text-xs text-muted-foreground">Reviews by AI priority</p>
              <ul className="mt-4 space-y-3">
                {(Object.keys(derived.priorityCounts) as ReviewPriority[]).map((priority) => {
                  const count = derived.priorityCounts[priority];
                  const pct = derived.total ? (count / derived.total) * 100 : 0;
                  return (
                    <li key={priority}>
                      <div className="flex items-center justify-between text-sm">
                        <PriorityBadge priority={priority} />
                        <span className="tabular-nums text-muted-foreground">{count}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
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
          </div>

          <Panel className="mt-4 p-5">
            <h2 className="font-display text-lg font-semibold">Case pipeline</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
              {(Object.keys(CASE_STATUS_LABELS) as CaseStatus[]).map((status) => (
                <div key={status} className="rounded-xl border border-border/60 bg-surface-2 p-3">
                  <p className="text-2xl font-bold tabular-nums">{derived.statusCounts[status] ?? 0}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{CASE_STATUS_LABELS[status]}</p>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function TrendChart({ points }: { points: { month: string; avg: number; count: number }[] }) {
  if (points.length < 2)
    return <p className="py-12 text-center text-sm text-muted-foreground">Not enough history yet.</p>;
  const width = 640;
  const height = 200;
  const pad = 24;
  const stepX = (width - pad * 2) / (points.length - 1);
  const toY = (value: number) => height - pad - ((value - 1) / 4) * (height - pad * 2);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${pad + index * stepX} ${toY(point.avg)}`)
    .join(" ");

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full min-w-[520px]">
        <defs>
          <linearGradient id="trend" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--violet)" />
            <stop offset="100%" stopColor="var(--neon)" />
          </linearGradient>
        </defs>
        {[1, 2, 3, 4, 5].map((tick) => (
          <g key={tick}>
            <line
              x1={pad}
              x2={width - pad}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="var(--border)"
              strokeDasharray="4 6"
            />
            <text x={4} y={toY(tick) + 4} fontSize="10" fill="var(--muted-foreground)">
              {tick}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="url(#trend)" strokeWidth="3" strokeLinecap="round" />
        {points.map((point, index) => (
          <circle
            key={point.month}
            cx={pad + index * stepX}
            cy={toY(point.avg)}
            r="4"
            fill="var(--neon)"
          >
            <title>{`${point.month}: ${point.avg.toFixed(2)} avg (${point.count} reviews)`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between px-6 text-[10px] text-muted-foreground">
        <span>{points[0]!.month}</span>
        <span>{points[points.length - 1]!.month}</span>
      </div>
    </div>
  );
}
