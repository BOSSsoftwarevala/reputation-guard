import {
  CASE_STATUS_LABELS,
  PRIORITY_LABELS,
  VIOLATION_LABELS,
  type CaseStatus,
  type ReviewPriority,
  type ViolationCategory,
} from "@/lib/domain";

const PRIORITY_STYLES: Record<ReviewPriority, string> = {
  high: "bg-danger/12 text-danger ring-danger/40",
  medium: "bg-warning/12 text-warning ring-warning/40",
  review_required: "bg-caution/15 text-caution ring-caution/40",
  normal: "bg-success/12 text-success ring-success/40",
};

const PRIORITY_DOT: Record<ReviewPriority, string> = {
  high: "bg-danger",
  medium: "bg-warning",
  review_required: "bg-caution",
  normal: "bg-success",
};

export function PriorityBadge({ priority }: { priority: ReviewPriority }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${PRIORITY_STYLES[priority]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[priority]} shadow-[0_0_8px_currentColor]`} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const STATUS_STYLES: Record<CaseStatus, string> = {
  new: "bg-muted text-muted-foreground ring-border",
  reviewing: "bg-primary/12 text-primary ring-primary/35",
  evidence_ready: "bg-neon/15 text-neon ring-neon/40",
  reported: "bg-violet/15 text-violet ring-violet/40",
  appeal: "bg-warning/12 text-warning ring-warning/40",
  resolved: "bg-success/14 text-success ring-success/40",
  rejected: "bg-danger/12 text-danger ring-danger/40",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: ViolationCategory | null }) {
  if (!category) return <span className="text-xs text-muted-foreground">Not scanned</span>;
  const legit = category === "none";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        legit ? "bg-success/10 text-success ring-success/30" : "bg-magenta/10 text-magenta ring-magenta/30"
      }`}
    >
      {legit ? "Legitimate review" : VIOLATION_LABELS[category]}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round(value);
  const tone = pct >= 75 ? "bg-danger" : pct >= 45 ? "bg-warning" : "bg-neon";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className={rating <= 2 ? "text-danger" : rating === 3 ? "text-warning" : "text-success"}>
        {"★".repeat(rating)}
        <span className="text-muted-foreground/40">{"★".repeat(5 - rating)}</span>
      </span>
    </span>
  );
}
