import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import {
  cancelScanJob,
  getActiveScanJob,
  processScanBatch,
  startScanJob,
} from "@/lib/reviews.functions";
import { useWorkspace } from "@/components/workspace";
import { BusinessGate } from "@/components/business-gate";
import { PageHeader, Panel } from "@/components/ui-kit";
import { Icon3D } from "@/components/icon-3d";
import { VIOLATION_LABELS, VIOLATION_ORDER } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/scanner")({
  head: () => ({
    meta: [
      { title: "AI scanner — OrbitRep" },
      {
        name: "description",
        content:
          "Run bounded, resumable AI scans that classify Google reviews against Google's prohibited content policies.",
      },
      { property: "og:title", content: "AI scanner — OrbitRep" },
      { property: "og:description", content: "Bulk AI policy-violation scanning for Google reviews." },
    ],
  }),
  component: () => (
    <BusinessGate>
      <ScannerPage />
    </BusinessGate>
  ),
});

function ScannerPage() {
  const { activeBusiness } = useWorkspace();
  const businessId = activeBusiness?.id ?? "";
  const queryClient = useQueryClient();
  const getJob = useServerFn(getActiveScanJob);
  const start = useServerFn(startScanJob);
  const process = useServerFn(processScanBatch);
  const cancel = useServerFn(cancelScanJob);
  const [log, setLog] = useState<string[]>([]);
  const running = useRef(false);

  const { data: job, refetch } = useQuery({
    queryKey: ["scan-job", businessId],
    queryFn: () => getJob({ data: { businessId } }),
    enabled: Boolean(businessId),
    refetchInterval: 4000,
  });

  const pump = async (jobId: string) => {
    if (running.current) return;
    running.current = true;
    try {
      for (let index = 0; index < 400; index++) {
        const result = await process({ data: { jobId } });
        setLog((entries) =>
          [
            `${new Date().toLocaleTimeString()} — ${result.job.processed_reviews}/${result.job.total_reviews} analyzed · ${result.flagged} flagged this batch`,
            ...entries,
          ].slice(0, 40),
        );
        await refetch();
        if (result.done) break;
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
    } catch (caught) {
      setLog((entries) => [`Error: ${(caught as Error).message}`, ...entries]);
    } finally {
      running.current = false;
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    }
  };

  const startMutation = useMutation({
    mutationFn: (rescanAll: boolean) => start({ data: { businessId, rescanAll } }),
    onSuccess: (created) => {
      setLog(["Scan job started."]);
      void pump(created.id);
    },
  });

  useEffect(() => {
    if (job?.status === "running" && !running.current) void pump(job.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  const total = job?.total_reviews ?? 0;
  const processed = job?.processed_reviews ?? 0;
  const pct = total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const isRunning = job?.status === "running";

  return (
    <div>
      <PageHeader
        icon="scanner"
        title="AI violation scanner"
        subtitle="Every unscanned review is analyzed in small batches against Google's prohibited & restricted content policies. Progress is saved after each batch, so scans resume safely."
        actions={
          <>
            <button
              onClick={() => startMutation.mutate(false)}
              disabled={isRunning || startMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Scan new reviews
            </button>
            <button
              onClick={() => startMutation.mutate(true)}
              disabled={isRunning || startMutation.isPending}
              className="glass rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Rescan everything
            </button>
            {isRunning ? (
              <button
                onClick={async () => {
                  await cancel({ data: { jobId: job!.id } });
                  await refetch();
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-danger/50 px-4 py-2 text-sm font-medium text-danger"
              >
                <Square className="h-4 w-4" /> Stop
              </button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="p-6 lg:col-span-2">
          <div className="flex items-center gap-4">
            <Icon3D name="scanner" size={64} className={isRunning ? "float-slow" : ""} priority />
            <div className="flex-1">
              <p className="font-display text-lg font-semibold">
                {isRunning ? "Scanning in progress" : job ? "Last scan" : "No scan run yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {processed} of {total} reviews analyzed
                {job?.flagged_reviews ? ` · ${job.flagged_reviews} flagged` : ""}
              </p>
            </div>
            <span className="font-display text-3xl font-bold tabular-nums text-gradient">{pct}%</span>
          </div>
          <div className={`mt-5 h-2.5 overflow-hidden rounded-full bg-muted ${isRunning ? "scan-line" : ""}`}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet via-magenta to-neon transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {job?.error_message ? <p className="mt-3 text-sm text-danger">{job.error_message}</p> : null}
          {startMutation.error ? (
            <p className="mt-3 text-sm text-danger">{(startMutation.error as Error).message}</p>
          ) : null}

          <div className="mt-6 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-surface-2 p-3 font-mono text-xs text-muted-foreground">
            {log.length === 0 ? <p>Awaiting activity…</p> : log.map((line, index) => <p key={index}>{line}</p>)}
          </div>
        </Panel>

        <Panel className="p-6">
          <h2 className="font-display text-lg font-semibold">What the AI checks</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each review is classified into one policy category with confidence, evidence and a priority.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {VIOLATION_ORDER.filter((category) => category !== "none").map((category) => (
              <li key={category} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-violet to-neon" />
                {VIOLATION_LABELS[category]}
              </li>
            ))}
          </ul>
          <p className="mt-5 rounded-xl border border-border/60 p-3 text-xs leading-relaxed text-muted-foreground">
            AI output is decision support, not a verdict. Genuine negative feedback is marked legitimate and is
            never eligible for a removal case.
          </p>
          <Link to="/reviews" className="mt-4 block text-sm font-medium text-neon">
            Open review feed →
          </Link>
        </Panel>
      </div>
    </div>
  );
}
