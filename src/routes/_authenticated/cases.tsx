import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Printer, Search } from "lucide-react";
import { listCases, getCase, updateCase, addCaseNote } from "@/lib/cases.functions";
import { useWorkspace } from "@/components/workspace";
import { BusinessGate } from "@/components/business-gate";
import {
  EmptyState,
  ErrorBlock,
  KpiCard,
  PageHeader,
  Panel,
  SkeletonRows,
} from "@/components/ui-kit";
import { CaseStatusBadge, CategoryBadge, RatingStars } from "@/components/badges";
import {
  CASE_STATUS_FLOW,
  CASE_STATUS_LABELS,
  VIOLATION_LABELS,
  type CaseStatus,
  type ViolationCategory,
} from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/cases")({
  head: () => ({
    meta: [
      { title: "Removal cases — OrbitRep" },
      {
        name: "description",
        content:
          "Track every Google review removal case from evidence collection through official report, appeal and resolution.",
      },
      { property: "og:title", content: "Removal cases — OrbitRep" },
      {
        property: "og:description",
        content: "Case management for Google review policy-violation reports and appeals.",
      },
    ],
  }),
  component: () => (
    <BusinessGate>
      <CasesPage />
    </BusinessGate>
  ),
});

type CaseListRow = Awaited<ReturnType<typeof listCases>>[number];

function CasesPage() {
  const { activeBusiness } = useWorkspace();
  const businessId = activeBusiness?.id ?? "";
  const fetchCases = useServerFn(listCases);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cases", businessId, status, search],
    queryFn: () => fetchCases({ data: { businessId, status, search: search || undefined } }),
    enabled: Boolean(businessId),
  });

  const rows = useMemo(() => (data ?? []) as CaseListRow[], [data]);
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of rows) map[row.status] = (map[row.status] ?? 0) + 1;
    return map;
  }, [rows]);

  return (
    <div>
      <PageHeader
        icon="cases"
        title="Removal cases"
        subtitle="Every case follows Google's official reporting and appeal workflow. Removal decisions are made by Google — never guaranteed."
        actions={<OutcomeCheckButton businessId={businessId} onDone={() => void refetch()} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open cases" value={rows.filter((r) => !["resolved", "rejected"].includes(r.status)).length} icon="cases" />
        <KpiCard label="Removed by Google" value={rows.filter((r) => r.outcome === "removed_by_google").length} tone="success" icon="analytics" />
        <KpiCard label="Still live" value={rows.filter((r) => r.outcome === "still_live").length} tone="magenta" icon="reports" />
        <KpiCard label="Rejected" value={counts["rejected"] ?? 0} tone="danger" icon="alerts" />
      </div>


      <Panel className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search case number, reviewer or text"
              className="glass w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none focus:neon-outline"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="glass rounded-xl px-3 py-2 text-sm outline-none"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {CASE_STATUS_FLOW.map((value) => (
              <option key={value} value={value} className="bg-popover">
                {CASE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <SkeletonRows />
        ) : error ? (
          <ErrorBlock message={(error as Error).message} retry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="cases"
            title="No removal cases yet"
            description="Open a case from a flagged review in the review feed. Cases collect the AI analysis and evidence needed for an official Google report."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Review</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const review = row.reviews as {
                    reviewer_name?: string;
                    rating?: number;
                    review_text?: string;
                  } | null;
                  const location = row.locations as { name?: string } | null;
                  return (
                    <tr key={row.id} className="border-t border-border/50 hover:bg-surface-2/60">
                      <td className="px-4 py-3 font-semibold tabular-nums">#{row.case_number}</td>
                      <td className="max-w-[320px] px-4 py-3">
                        <div className="flex items-center gap-2">
                          {typeof review?.rating === "number" ? <RatingStars rating={review.rating} /> : null}
                          <span className="font-medium">{review?.reviewer_name ?? "Unknown"}</span>
                        </div>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{review?.review_text}</p>
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={row.violation_category as ViolationCategory} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{location?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <CaseStatusBadge status={row.status as CaseStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <OutcomeBadge outcome={row.outcome as string} />
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setOpenCaseId(row.id)}
                          className="rounded-lg bg-gradient-to-r from-violet to-neon px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {openCaseId ? <CaseDrawer caseId={openCaseId} onClose={() => setOpenCaseId(null)} /> : null}
    </div>
  );
}

function CaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fetchCase = useServerFn(getCase);
  const patchCase = useServerFn(updateCase);
  const postNote = useServerFn(addCaseNote);
  const [note, setNote] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchCase({ data: { caseId } }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: CaseStatus) => patchCase({ data: { caseId, status } }),
    onSuccess: () => {
      toast.success("Case status updated");
      void queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const noteMutation = useMutation({
    mutationFn: (message: string) => postNote({ data: { caseId, message } }),
    onSuccess: () => {
      setNote("");
      toast.success("Note added to case history");
      void queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const record = data?.case as Record<string, unknown> | undefined;
  const review = record?.["reviews"] as Record<string, unknown> | undefined;
  const business = record?.["businesses"] as Record<string, unknown> | undefined;
  const location = record?.["locations"] as Record<string, unknown> | undefined;

  const evidencePackage = useMemo(() => {
    if (!record) return "";
    const evidence = Array.isArray(record["evidence"]) ? (record["evidence"] as unknown[]) : [];
    const events = data?.events ?? [];
    return [
      `EVIDENCE PACKAGE — CASE #${String(record["case_number"])}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "BUSINESS",
      `Name: ${String(business?.["name"] ?? "—")}`,
      `Industry: ${String(business?.["industry"] ?? "—")}`,
      `Website: ${String(business?.["website"] ?? "—")}`,
      `Location: ${String(location?.["name"] ?? "—")} ${String(location?.["address"] ?? "")} ${String(location?.["city"] ?? "")} ${String(location?.["country"] ?? "")}`.trim(),
      `Google Place ID: ${String(location?.["google_place_id"] ?? "—")}`,
      "",
      "REVIEW UNDER REPORT",
      `Reviewer: ${String(review?.["reviewer_name"] ?? "—")}`,
      `Rating: ${String(review?.["rating"] ?? "—")}/5`,
      `Date: ${String(review?.["review_date"] ?? "—")}`,
      `Text: ${String(review?.["review_text"] ?? "—")}`,
      "",
      "POLICY CATEGORY",
      VIOLATION_LABELS[(record["violation_category"] as ViolationCategory) ?? "other"],
      "",
      "AI ANALYSIS",
      `Confidence: ${String(review?.["ai_confidence"] ?? "—")}%`,
      `Explanation: ${String(review?.["ai_explanation"] ?? "—")}`,
      `Recommended action: ${String(review?.["recommended_action"] ?? "—")}`,
      "",
      "SUPPORTING EVIDENCE",
      ...(evidence.length ? evidence.map((item, i) => `${i + 1}. ${String(item)}`) : ["No evidence recorded."]),
      "",
      "CASE NOTES",
      String(record["notes"] ?? "—"),
      "",
      "TIMELINE",
      ...events.map(
        (event) => `${new Date(event.created_at).toISOString()} — ${event.event_type}: ${event.message ?? ""}`,
      ),
      "",
      "COMPLIANCE NOTE",
      "This package supports a good-faith report under Google's review policies. It contains no fabricated evidence and does not guarantee removal; the decision belongs to Google.",
    ].join("\n");
  }, [record, review, business, location, data?.events]);

  const printPackage = () => {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error("Allow pop-ups to print the evidence package.");
      return;
    }
    const escaped = evidencePackage.replace(/[&<>]/g, (char) =>
      char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;",
    );
    win.document.write(
      `<!doctype html><html><head><title>Case ${String(record?.["case_number"] ?? "")} evidence package</title>` +
        `<style>body{font-family:ui-sans-serif,system-ui,sans-serif;padding:40px;color:#111}` +
        `h1{font-size:18px;letter-spacing:.04em}pre{white-space:pre-wrap;font-size:12px;line-height:1.6}</style>` +
        `</head><body><h1>OrbitRep — Evidence Package</h1><pre>${escaped}</pre></body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  const download = () => {
    const blob = new Blob([evidencePackage], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `case-${String(record?.["case_number"] ?? "export")}-evidence.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Evidence package downloaded");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm">
      <button className="flex-1" aria-label="Close case" onClick={onClose} />
      <aside className="glass h-full w-full max-w-xl overflow-y-auto border-l border-border/60 p-6">
        {isLoading ? (
          <SkeletonRows />
        ) : error ? (
          <ErrorBlock message={(error as Error).message} retry={() => void refetch()} />
        ) : record ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold">Case #{String(record["case_number"])}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Opened {new Date(String(record["created_at"])).toLocaleString()}
                </p>
              </div>
              <CaseStatusBadge status={record["status"] as CaseStatus} />
            </div>

            <div className="mt-5 rounded-xl border border-border/60 bg-surface-2 p-4">
              <div className="flex items-center gap-2">
                <RatingStars rating={Number(review?.["rating"] ?? 0)} />
                <span className="text-sm font-medium">{String(review?.["reviewer_name"] ?? "")}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{String(review?.["review_text"] ?? "")}</p>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Policy category: </span>
                <CategoryBadge category={record["violation_category"] as ViolationCategory} />
              </p>
              <p className="text-muted-foreground">
                AI confidence: <span className="text-foreground">{String(review?.["ai_confidence"] ?? "—")}%</span>
              </p>
              <p className="text-muted-foreground">{String(review?.["ai_explanation"] ?? "")}</p>
            </div>

            <h3 className="mt-6 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Advance workflow
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {CASE_STATUS_FLOW.map((value) => (
                <button
                  key={value}
                  disabled={statusMutation.isPending || record["status"] === value}
                  onClick={() => statusMutation.mutate(value)}
                  className="glass rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 hover:neon-outline"
                >
                  {CASE_STATUS_LABELS[value]}
                </button>
              ))}
            </div>

            <h3 className="mt-6 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Evidence package
            </h3>
            <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-border/60 bg-surface-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
              {evidencePackage}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={download}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Download className="h-4 w-4" /> Export case summary
            </button>
            <button
              onClick={printPackage}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium"
            >
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
            </div>

            <h3 className="mt-6 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Case history
            </h3>
            <ol className="mt-2 space-y-3 border-l border-border/60 pl-4">
              {(data?.events ?? []).map((event) => (
                <li key={event.id} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-neon" />
                  <p className="font-medium">{event.event_type}</p>
                  <p className="text-muted-foreground">{event.message}</p>
                  <p className="text-[11px] text-muted-foreground/70">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-4 flex gap-2">
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a note to case history"
                className="glass flex-1 rounded-xl px-3 py-2 text-sm outline-none focus:neon-outline"
              />
              <button
                disabled={!note.trim() || noteMutation.isPending}
                onClick={() => noteMutation.mutate(note.trim())}
                className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

const OUTCOME_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground ring-border",
  removed_by_google: "bg-success/14 text-success ring-success/40",
  still_live: "bg-warning/12 text-warning ring-warning/40",
  no_result: "bg-danger/12 text-danger ring-danger/40",
};

const OUTCOME_LABELS: Record<string, string> = {
  pending: "Awaiting Google",
  removed_by_google: "Removed by Google",
  still_live: "Still live",
  no_result: "No result",
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  const key = OUTCOME_LABELS[outcome] ? outcome : "pending";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${OUTCOME_STYLES[key]}`}
    >
      {OUTCOME_LABELS[key]}
    </span>
  );
}

function OutcomeCheckButton({ businessId, onDone }: { businessId: string; onDone: () => void }) {
  const check = useServerFn(checkRemovalOutcomes);
  const mutation = useMutation({
    mutationFn: () => check({ data: { businessId } }),
    onSuccess: (result) => {
      toast.success(
        `Outcome check complete — ${result.resolved} removed by Google, ${result.stillLive} still live.`,
      );
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <button
      disabled={!businessId || mutation.isPending}
      onClick={() => mutation.mutate()}
      className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold hover:neon-outline disabled:opacity-40"
    >
      {mutation.isPending ? "Checking Google…" : "Check removal outcomes"}
    </button>
  );
}
