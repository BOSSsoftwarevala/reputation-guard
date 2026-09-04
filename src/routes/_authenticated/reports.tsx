import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { getBusinessReport } from "@/lib/reports.functions";
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

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function ReportsPage() {
  const { activeBusiness } = useWorkspace();
  const businessId = activeBusiness?.id ?? "";
  const businessName = activeBusiness?.name ?? "your workspace";
  const fetchReport = useServerFn(getBusinessReport);
  const [range, setRange] = useState<string>("90");
  const days = range === "all" ? null : Number(range);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["report", businessId, range],
    queryFn: () => fetchReport({ data: { businessId, days } }),
    enabled: Boolean(businessId),
    staleTime: 60_000,
  });

  const rangeLabel = RANGES.find((option) => option.key === range)?.label ?? "";

  const model = useMemo(() => {
    const totals = data?.totals;
    const cases = data?.cases;
    const closed = (cases?.resolved ?? 0) + (cases?.rejected ?? 0);
    return {
      total: totals?.reviews ?? 0,
      avg: Number(totals?.avg_rating ?? 0),
      negative: totals?.negative ?? 0,
      scanned: totals?.scanned ?? 0,
      flagged: totals?.flagged ?? 0,
      removed: cases?.removed_by_google ?? 0,
      casesTotal: cases?.total ?? 0,
      resolved: cases?.resolved ?? 0,
      avgDays: cases?.avg_days_to_resolve ?? 0,
      successRate: closed ? Math.round(((cases?.resolved ?? 0) / closed) * 100) : 0,
      violations: Object.entries(data?.violation_distribution ?? {}).filter(
        ([key, count]) => count > 0 && key !== "none" && key !== "unscanned",
      ),
      statuses: Object.entries(data?.cases?.by_status ?? {}),
      monthly: data?.monthly ?? [],
      locations: data?.locations ?? [],
    };
  }, [data]);

  const text = useMemo(
    () =>
      [
        `REPUTATION REPORT — ${businessName}`,
        `Period: ${rangeLabel}`,
        `Generated: ${new Date().toLocaleString()}`,
        "",
        "SUMMARY",
        `Reviews in period: ${model.total}`,
        `Average rating: ${model.avg.toFixed(2)} / 5`,
        `Negative reviews (1–2★): ${model.negative}`,
        `AI-scanned reviews: ${model.scanned}`,
        `Policy violations detected: ${model.flagged}`,
        "",
        "REVIEW VOLUME BY MONTH",
        ...(model.monthly.length
          ? model.monthly.map(
              (row) =>
                `- ${row.month}: ${row.reviews} reviews · avg ${Number(row.avg_rating).toFixed(2)} · ${row.negative} negative · ${row.flagged} flagged`,
            )
          : ["- No review activity in this period."]),
        "",
        "VIOLATION BREAKDOWN",
        ...(model.violations.length
          ? model.violations.map(
              ([key, count]) => `- ${VIOLATION_LABELS[key as ViolationCategory] ?? key}: ${count}`,
            )
          : ["- None detected in this period."]),
        "",
        "REMOVAL CASES",
        `Cases opened: ${model.casesTotal}`,
        `Cases resolved (review removed): ${model.resolved}`,
        `Confirmed removed by Google: ${model.removed}`,
        `Average days to resolution: ${model.avgDays}`,
        `Success rate on closed cases: ${model.successRate}%`,
        ...model.statuses.map(
          ([key, count]) => `- ${CASE_STATUS_LABELS[key as CaseStatus] ?? key}: ${count}`,
        ),
        "",
        "LOCATION COMPARISON",
        ...(model.locations.length
          ? model.locations.map(
              (row) =>
                `- ${row.name}: ${row.reviews} reviews · avg ${Number(row.avg_rating).toFixed(2)} · ${row.flagged} flagged · ${row.cases} cases · ${row.resolved_cases} resolved`,
            )
          : ["- No locations configured."]),
        "",
        "NOTE",
        "Removal decisions are made solely by Google after reviewing each report. This document summarises detection, evidence and reporting activity performed on the client's behalf.",
      ].join("\n"),
    [businessName, rangeLabel, model],
  );

  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const saveFile = (contents: string, filename: string, mime: string) => {
    const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const rows: unknown[][] = [
      ["OrbitRep reputation report"],
      ["Workspace", businessName],
      ["Period", rangeLabel],
      ["Generated", new Date().toISOString()],
      [],
      ["SUMMARY"],
      ["Metric", "Value"],
      ["Reviews in period", model.total],
      ["Average rating", model.avg.toFixed(2)],
      ["Negative reviews (1-2 stars)", model.negative],
      ["AI-scanned reviews", model.scanned],
      ["Policy violations detected", model.flagged],
      [],
      ["REVIEW VOLUME BY MONTH"],
      ["Month", "Reviews", "Average rating", "Negative", "Flagged"],
      ...model.monthly.map((row) => [row.month, row.reviews, row.avg_rating, row.negative, row.flagged]),
      [],
      ["VIOLATION DISTRIBUTION"],
      ["Category", "Reviews"],
      ...model.violations.map(([key, count]) => [
        VIOLATION_LABELS[key as ViolationCategory] ?? key,
        count,
      ]),
      [],
      ["CASE RESOLUTION"],
      ["Metric", "Value"],
      ["Cases opened", model.casesTotal],
      ["Cases resolved", model.resolved],
      ["Confirmed removed by Google", model.removed],
      ["Average days to resolution", model.avgDays],
      ["Success rate on closed cases (%)", model.successRate],
      ["Status", "Cases"],
      ...model.statuses.map(([key, count]) => [CASE_STATUS_LABELS[key as CaseStatus] ?? key, count]),
      [],
      ["LOCATION COMPARISON"],
      ["Location", "Reviews", "Average rating", "Negative", "Flagged", "Cases", "Resolved cases"],
      ...model.locations.map((row) => [
        row.name,
        row.reviews,
        row.avg_rating,
        row.negative,
        row.flagged,
        row.cases,
        row.resolved_cases,
      ]),
    ];
    saveFile(toCsv(rows), `${slug}-reputation-report.csv`, "text/csv");
  };

  const printReport = () => {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    const escaped = text.replace(/[&<>]/g, (char) =>
      char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;",
    );
    win.document.write(
      `<!doctype html><html><head><title>${businessName} — reputation report</title>` +
        `<style>body{font-family:ui-sans-serif,system-ui,sans-serif;padding:44px;color:#111}` +
        `h1{font-size:20px;letter-spacing:.03em;margin-bottom:4px}` +
        `pre{white-space:pre-wrap;font-size:12px;line-height:1.65}</style></head>` +
        `<body><h1>OrbitRep — Reputation Report</h1><pre>${escaped}</pre></body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  if (isLoading) return <LoadingBlock label="Assembling report" />;
  if (error) return <ErrorBlock message={(error as Error).message} retry={() => void refetch()} />;

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
              onClick={downloadCsv}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <FileSpreadsheet className="h-4 w-4" /> Export CSV
            </button>
            <button
              onClick={() => saveFile(text, `${slug}-reputation-report.txt`, "text/plain")}
              className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            >
              <Download className="h-4 w-4" /> Export summary
            </button>
            <button
              onClick={printReport}
              className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
            >
              <FileText className="h-4 w-4" /> Print / PDF
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Reviews in period" value={model.total} icon="reviews" hint={rangeLabel} />
        <KpiCard label="Average rating" value={model.avg.toFixed(2)} tone="success" icon="analytics" />
        <KpiCard label="Violations detected" value={model.flagged} tone="danger" icon="scanner" />
        <KpiCard
          label="Removal success"
          value={`${model.successRate}%`}
          tone="neon"
          icon="cases"
          hint={`${model.resolved} of ${model.casesTotal} cases resolved`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="font-display text-lg font-semibold">Review volume</h2>
          <p className="text-xs text-muted-foreground">Monthly totals inside the selected period</p>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2">Month</th>
                <th className="py-2">Reviews</th>
                <th className="py-2">Avg</th>
                <th className="py-2">Negative</th>
                <th className="py-2">Flagged</th>
              </tr>
            </thead>
            <tbody>
              {model.monthly.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No review activity in this period.
                  </td>
                </tr>
              ) : (
                model.monthly.map((row) => (
                  <tr key={row.month} className="border-t border-border/50">
                    <td className="py-2">{row.month}</td>
                    <td className="py-2 tabular-nums">{row.reviews}</td>
                    <td className="py-2 tabular-nums">{Number(row.avg_rating).toFixed(2)}</td>
                    <td className="py-2 tabular-nums text-warning">{row.negative}</td>
                    <td className="py-2 tabular-nums text-danger">{row.flagged}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-lg font-semibold">Violation distribution</h2>
          <p className="text-xs text-muted-foreground">Policy categories detected by the AI scanner</p>
          {model.violations.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No policy violations detected in this period.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {model.violations.map(([key, count]) => {
                const pct = model.flagged ? (count / model.flagged) * 100 : 0;
                return (
                  <li key={key}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{VIOLATION_LABELS[key as ViolationCategory] ?? key}</span>
                      <span className="tabular-nums text-muted-foreground">{count}</span>
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

      <Panel className="mt-4 overflow-hidden">
        <div className="border-b border-border/60 p-5">
          <h2 className="font-display text-lg font-semibold">Per-location comparison</h2>
          <p className="text-xs text-muted-foreground">Every managed storefront side by side</p>
        </div>
        {model.locations.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No locations configured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Reviews</th>
                  <th className="px-4 py-3">Avg rating</th>
                  <th className="px-4 py-3">Negative</th>
                  <th className="px-4 py-3">Flagged</th>
                  <th className="px-4 py-3">Cases</th>
                  <th className="px-4 py-3">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {model.locations.map((row) => (
                  <tr key={row.id} className="border-t border-border/50">
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3 tabular-nums">{row.reviews}</td>
                    <td className="px-4 py-3 tabular-nums">{Number(row.avg_rating).toFixed(2)}</td>
                    <td className="px-4 py-3 tabular-nums text-warning">{row.negative}</td>
                    <td className="px-4 py-3 tabular-nums text-danger">{row.flagged}</td>
                    <td className="px-4 py-3 tabular-nums">{row.cases}</td>
                    <td className="px-4 py-3 tabular-nums text-success">{row.resolved_cases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-4 p-6">
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
