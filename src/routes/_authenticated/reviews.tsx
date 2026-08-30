import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { importReviews, listReviews } from "@/lib/reviews.functions";
import { createCasesBulk } from "@/lib/cases.functions";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace";
import { BusinessGate } from "@/components/business-gate";
import { EmptyState, ErrorBlock, PageHeader, Panel, SkeletonRows } from "@/components/ui-kit";
import { CategoryBadge, ConfidenceMeter, PriorityBadge, RatingStars } from "@/components/badges";
import { ReviewDrawer, type ReviewWithRelations } from "@/components/review-drawer";
import { PRIORITY_LABELS, VIOLATION_LABELS, VIOLATION_ORDER, type ReviewPriority, type ViolationCategory } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/reviews")({
  head: () => ({
    meta: [
      { title: "Review feed — OrbitRep" },
      {
        name: "description",
        content: "Filter, search and triage every imported Google review with AI violation analysis.",
      },
      { property: "og:title", content: "Review feed — OrbitRep" },
      { property: "og:description", content: "Triage Google reviews with AI policy-violation analysis." },
    ],
  }),
  component: () => (
    <BusinessGate>
      <ReviewsPage />
    </BusinessGate>
  ),
});

function ReviewsPage() {
  const { activeBusiness, locations } = useWorkspace();
  const businessId = activeBusiness!.id;
  const fetchReviews = useServerFn(listReviews);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [scanStatus, setScanStatus] = useState("all");
  const [locationId, setLocationId] = useState("");
  const [sortBy, setSortBy] = useState<"review_date" | "rating" | "ai_confidence">("review_date");
  const [selected, setSelected] = useState<ReviewWithRelations | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const bulkCases = useServerFn(createCasesBulk);
  const queryClient = useQueryClient();

  const filters = {
    businessId,
    page,
    pageSize: 25,
    search: search || undefined,
    priority,
    category,
    scanStatus,
    locationId: locationId || null,
    sortBy,
    sortDir: "desc" as const,
    hasCase: "any" as const,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reviews", filters],
    queryFn: () => fetchReviews({ data: filters }),
  });

  const rows = (data?.rows ?? []) as ReviewWithRelations[];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  const selectedIds = Object.keys(checked).filter((id) => checked[id]);

  const bulkMutation = useMutation({
    mutationFn: () => bulkCases({ data: { reviewIds: selectedIds } }),
    onSuccess: (result) => {
      toast.success(
        `${result.created} case${result.created === 1 ? "" : "s"} opened` +
          (result.skipped ? ` · ${result.skipped} already had a case` : ""),
      );
      setChecked({});
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (caught: Error) => toast.error(caught.message),
  });

  const allChecked = rows.length > 0 && rows.every((row) => checked[row.id]);

  const selectClass =
    "rounded-xl border border-input bg-surface px-3 py-2 text-sm outline-none focus:neon-outline";

  return (
    <div>
      <PageHeader
        icon="reviews"
        title="Review feed"
        subtitle="Every imported Google review, enriched with AI policy analysis."
        actions={
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground hover:neon-outline"
          >
            <Upload className="h-4 w-4" />
            Import reviews
          </button>
        }
      />

      <Panel className="mb-4 flex flex-wrap items-center gap-2 p-4">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search text or reviewer…"
          className={`${selectClass} min-w-[220px] flex-1`}
        />
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className={selectClass}>
          <option value="all">All priorities</option>
          {(Object.keys(PRIORITY_LABELS) as ReviewPriority[]).map((key) => (
            <option key={key} value={key} className="bg-popover">{PRIORITY_LABELS[key]}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={selectClass}>
          <option value="all">All categories</option>
          {VIOLATION_ORDER.map((key: ViolationCategory) => (
            <option key={key} value={key} className="bg-popover">{VIOLATION_LABELS[key]}</option>
          ))}
        </select>
        <select value={scanStatus} onChange={(e) => { setScanStatus(e.target.value); setPage(1); }} className={selectClass}>
          <option value="all">Any scan state</option>
          <option value="unscanned" className="bg-popover">Unscanned</option>
          <option value="scanned" className="bg-popover">Scanned</option>
          <option value="failed" className="bg-popover">Failed</option>
        </select>
        <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setPage(1); }} className={selectClass}>
          <option value="">All locations</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id} className="bg-popover">{location.name}</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selectClass}>
          <option value="review_date" className="bg-popover">Newest first</option>
          <option value="rating" className="bg-popover">Highest rating</option>
          <option value="ai_confidence" className="bg-popover">AI confidence</option>
        </select>
      </Panel>

      {selectedIds.length > 0 ? (
        <Panel className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4 neon-outline">
          <span className="text-sm font-medium">{selectedIds.length} review(s) selected</span>
          <div className="flex gap-2">
            <button
              onClick={() => setChecked({})}
              className="rounded-xl border border-border px-3 py-2 text-sm"
            >
              Clear
            </button>
            <button
              onClick={() => bulkMutation.mutate()}
              disabled={bulkMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-magenta px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {bulkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Open removal cases
            </button>
          </div>
        </Panel>
      ) : null}

      <Panel className="overflow-hidden">
        {isLoading ? (
          <SkeletonRows />
        ) : error ? (
          <ErrorBlock message={(error as Error).message} retry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="reviews"
            title="No reviews match"
            description="Import a Google review export or relax the filters above."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all reviews on this page"
                      checked={allChecked}
                      onChange={(event) =>
                        setChecked(
                          event.target.checked
                            ? Object.fromEntries(rows.map((row) => [row.id, true]))
                            : {},
                        )
                      }
                    />
                  </th>
                  <th className="px-4 py-3">Reviewer</th>
                  <th className="px-4 py-3">Rating</th>
                  <th className="px-4 py-3">Review</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select review by ${row.reviewer_name}`}
                        checked={Boolean(checked[row.id])}
                        onChange={(event) =>
                          setChecked((current) => ({ ...current, [row.id]: event.target.checked }))
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {row.reviewer_name}
                      {row.removal_cases?.length ? (
                        <span className="ml-2 rounded bg-violet/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet">
                          case
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3"><RatingStars rating={row.rating} /></td>
                    <td className="max-w-sm truncate px-4 py-3 text-muted-foreground">{row.review_text}</td>
                    <td className="px-4 py-3"><CategoryBadge category={row.violation_category as ViolationCategory | null} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={row.priority as ReviewPriority} /></td>
                    <td className="px-4 py-3"><ConfidenceMeter value={row.ai_confidence} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(row.review_date).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pages} · {total} reviews
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="glass rounded-lg px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= pages}
              onClick={() => setPage((value) => value + 1)}
              className="glass rounded-lg px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {selected ? <ReviewDrawer review={selected} onClose={() => setSelected(null)} /> : null}
      {showImport ? <ImportDialog businessId={businessId} onClose={() => setShowImport(false)} /> : null}
    </div>
  );
}

const SAMPLE = `reviewer_name,rating,review_text,review_date,location_name
Jane D.,1,"Never been here, competitor spam",2024-05-02,Downtown`;

function ImportDialog({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const importFn = useServerFn(importReviews);
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = parseImport(raw);
      if (parsed.length === 0) throw new Error("No valid rows found. Check the format below.");
      return importFn({ data: { businessId, reviews: parsed } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      onClose();
    },
    onError: (caught) => setError((caught as Error).message),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="glass relative w-full max-w-2xl rounded-2xl border border-border p-6">
        <h2 className="font-display text-xl font-bold">Import Google reviews</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a CSV (with header row) or a JSON array exported from Google Business Profile or your review
          aggregator. Duplicates are skipped automatically.
        </p>
        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setRaw(await file.text());
          }}
          className="mt-4 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-foreground"
        />
        <textarea
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          rows={9}
          placeholder={SAMPLE}
          className="mt-3 w-full rounded-xl border border-input bg-surface p-3 font-mono text-xs"
        />
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => { setError(null); mutation.mutate(); }}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

type ImportRow = {
  source_review_id?: string | undefined;
  reviewer_name?: string | undefined;
  rating: number;
  review_text?: string | undefined;
  review_date?: string | undefined;
  location_name?: string | undefined;
};

function parseImport(raw: string): ImportRow[] {
  const text = raw.trim();
  if (!text) return [];
  if (text.startsWith("[") || text.startsWith("{")) {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : (parsed.reviews ?? []);
    return list
      .map((item: Record<string, unknown>) => normalizeRow(item))
      .filter((item: ImportRow | null): item is ImportRow => item !== null);
  }
  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];
  const headers = lines[0]!.map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines
    .slice(1)
    .map((cells) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = cells[index];
      });
      return normalizeRow(record);
    })
    .filter((item): item is ImportRow => item !== null);
}

function normalizeRow(record: Record<string, unknown>): ImportRow | null {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return undefined;
  };
  const ratingRaw = pick("rating", "star_rating", "stars", "score");
  const rating = Math.round(Number(ratingRaw));
  if (!rating || rating < 1 || rating > 5) return null;
  return {
    source_review_id: pick("source_review_id", "review_id", "id"),
    reviewer_name: pick("reviewer_name", "author", "name", "reviewer"),
    rating,
    review_text: pick("review_text", "text", "comment", "review", "content"),
    review_date: pick("review_date", "date", "created_at", "time"),
    location_name: pick("location_name", "location", "store", "branch"),
  };
}

function splitCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}
