import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { getBusinessStats } from "@/lib/reviews.functions";
import { listCases } from "@/lib/cases.functions";
import { useWorkspace } from "@/components/workspace";
import { BusinessGate } from "@/components/business-gate";
import { ErrorBlock, KpiCard, LoadingBlock, PageHeader, Panel } from "@/components/ui-kit";
import { CASE_STATUS_LABELS, VIOLATION_LABELS, type CaseStatus, type ViolationCategory } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Client reports — OrbitRep" },
      {
        name: "description",
        content:
          "Generate branded client-ready reputation reports covering review health, violations detected and removal case outcomes.",
      },
      { property: "og:title", content: "Client reports — OrbitRep" },
      {
        property: "og:description",
        content: "Export client-ready Google review reputation and removal reports.",
      },
    ],
  }),
  component: () => (
    <BusinessGate>
      <ReportsPage />
    </BusinessGate>
  ),
});

const RANGES = [
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "365", label: "Last 12 months" },
  { key: "all", label: "All time" },
] as const;

function ReportsPage() {
  const { activeBusiness } = useWorkspace();
  const businessId = activeBusiness?.id ?? "";
  const fetchStats = useServerFn(getBusinessStats);
  const fetchCases = useServerFn(listCases);
  const [range, setRange] = useState<string>("90");

  const statsQuery = useQuery({
    queryKey: ["stats", businessId],
    queryFn: () => fetchStats({ data: { businessId } }),
  });
  const casesQuery = useQuery({
    queryKey: ["cases", businessId, "all", ""],
    queryFn: () => fetchCases({ data: { businessId, status: "all" } }),
  });

  const report = useMemo(() => {
    const since =
      range === "all" ? null : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();
    const reviews = (statsQuery.data?.reviews ?? []).filter(
      (review) => !since || String(review.review_date) >= since.slice(0, 10),
    );
    const cases = (casesQuery.data ?? []).filter((item) => !since || item.created_at >= since);

    const total = reviews.length;
    const avg = total ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    const flagged = reviews.filter((r) => r.violation_category && r.violation_category !== "none");
    const resolved = cases.filter((c) => c.status === "resolved").length;
    const closed = cases.filter((c) => c.status === "resolved" || c.status === "rejected").length;

    const categoryCounts = flagged.reduce<Record<string, number>>((acc, review) => {
      const key = String(review.violation_category);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const statusCounts = cases.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total,
      avg,
      flagged: flagged.length,
      cases: cases.length,
      resolved,
      successRate: closed ? Math.round((resolved / closed) * 100) : 0,
      categoryCounts,
      statusCounts,
      negative: reviews.filter((r) => r.rating <= 2).length,
      scanned: reviews.filter((r) => r.scan_status === "scanned").length,
      rangeLabel: RANGES.find((option) => option.key === range)?.label ?? "",
    };
  }, [statsQuery.data, casesQuery.data, range]);

  const text = useMemo(
    () =>
      [
        `REPUTATION REPORT — ${(activeBusiness?.name ?? "your workspace")}`,
        `Period: ${report.rangeLabel}`,
        `Generated: ${new Date().toLocaleString()}`,
        "",
        "SUMMARY",
        `Reviews in period: ${report.total}`,
        `Average rating: ${report.avg.toFixed(2)} / 5`,
        `Negative reviews (1–2★): ${report.negative}`,
        `AI-scanned reviews: ${report.scanned}`,
        `Policy violations detected: ${report.flagged}`,
        "",
        "VIOLATION BREAKDOWN",
        ...(Object.keys(report.categoryCounts).length
          ? Object.entries(report.categoryCounts).map(
              ([key, count]) => `- ${VIOLATION_LABELS[key as ViolationCategory] ?? key}: ${count}`,
            )
          : ["- None detected in this period."]),
        "",
        "REMOVAL CASES",
        `Cases opened: ${report.cases}`,
        `Cases resolved (review removed): ${report.resolved}`,
        `Success rate on closed cases: ${report.successRate}%`,
        ...Object.entries(report.statusCounts).map(
          ([key, count]) => `- ${CASE_STATUS_LABELS[key as CaseStatus] ?? key}: ${count}`,
        ),
        "",
        "NOTE",
        "Removal decisions are made solely by Google after reviewing each report. This document summarises detection, evidence and reporting activity performed on the client's behalf.",
      ].join("\n"),
    [activeBusiness, report],
  );

  const download = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(activeBusiness?.name ?? "your workspace").toLowerCase().replace(/\s+/g, "-")}-reputation-report.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (statsQuery.isLoading || casesQuery.isLoading) return <LoadingBlock label="Assembling report" />;
  if (statsQuery.error)
    return <ErrorBlock message={(statsQuery.error as Error).message} retry={() => void statsQuery.refetch()} />;

  return (
    <div>
      <PageHeader
        icon="reports"
        title="Client reports"
        subtitle="Client-ready summaries built from live review, scan and case data."
        actions={
          <>
            <select
              value={range}
              onChange={(event) => setRange(event.target.value)}
              className="glass rounded-xl px-3 py-2 text-sm outline-none"
              aria-label="Reporting period"
            >
              {RANGES.map((option) => (
                <option key={option.key} value={option.key} className="bg-popover">
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={download}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Download className="h-4 w-4" /> Export report
            </button>
            <button
              onClick={() => window.print()}
              className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            >
              <FileText className="h-4 w-4" /> Print / PDF
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Reviews in period" value={report.total} icon="reviews" hint={report.rangeLabel} />
        <KpiCard label="Average rating" value={report.avg.toFixed(2)} tone="success" icon="analytics" />
        <KpiCard label="Violations detected" value={report.flagged} tone="danger" icon="scanner" />
        <KpiCard
          label="Removal success"
          value={`${report.successRate}%`}
          tone="neon"
          icon="cases"
          hint={`${report.resolved} of ${report.cases} cases resolved`}
        />
      </div>

      <Panel className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold">Report preview</h2>
        <p className="text-xs text-muted-foreground">
          This is the exact document exported for the client — generated from live workspace data.
        </p>
        <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-surface-2 p-4 text-xs leading-relaxed">
          {text}
        </pre>
      </Panel>
    </div>
  );
}
