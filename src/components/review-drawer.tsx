import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, X } from "lucide-react";
import { generateResponseDraft } from "@/lib/reviews.functions";
import { createCase } from "@/lib/cases.functions";
import { CategoryBadge, ConfidenceMeter, PriorityBadge, RatingStars } from "@/components/badges";
import type { ReviewRow, ReviewPriority, ViolationCategory } from "@/lib/domain";

export type ReviewWithRelations = ReviewRow & {
  locations?: { name: string } | null;
  removal_cases?: { id: string; status: string }[] | null;
};

export function ReviewDrawer({
  review,
  onClose,
}: {
  review: ReviewWithRelations;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const draftFn = useServerFn(generateResponseDraft);
  const caseFn = useServerFn(createCase);
  const [tone, setTone] = useState<"professional" | "empathetic" | "concise" | "warm" | "formal">(
    "professional",
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const draftMutation = useMutation({
    mutationFn: () => draftFn({ data: { reviewId: review.id, tone } }),
    onSuccess: (result) => setDraft(result.response),
  });

  const caseMutation = useMutation({
    mutationFn: () => caseFn({ data: { reviewId: review.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });

  const evidence = Array.isArray(review.ai_evidence) ? (review.ai_evidence as string[]) : [];
  const hasCase = (review.removal_cases?.length ?? 0) > 0 || caseMutation.isSuccess;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <aside className="glass relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">{review.reviewer_name}</h2>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              <RatingStars rating={review.rating} />
              <span>{new Date(review.review_date).toLocaleDateString()}</span>
              {review.locations?.name ? <span>· {review.locations.name}</span> : null}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close panel" className="glass rounded-xl p-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-5 whitespace-pre-wrap rounded-xl border border-border/60 bg-surface-2 p-4 text-sm leading-relaxed">
          {review.review_text || "(No review text)"}
        </p>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            AI policy analysis
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <PriorityBadge priority={review.priority as ReviewPriority} />
            <CategoryBadge category={review.violation_category as ViolationCategory | null} />
            <ConfidenceMeter value={review.ai_confidence} />
          </div>
          {review.ai_explanation ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{review.ai_explanation}</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              This review hasn&apos;t been scanned yet. Run the AI scanner to analyze it.
            </p>
          )}
          {evidence.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {evidence.map((item, index) => (
                <li key={index} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Removal case
          </h3>
          {hasCase ? (
            <p className="mt-2 text-sm text-success">A removal case already exists for this review.</p>
          ) : (
            <button
              onClick={() => caseMutation.mutate()}
              disabled={caseMutation.isPending}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-magenta px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {caseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Open removal case
            </button>
          )}
          {caseMutation.error ? (
            <p className="mt-2 text-sm text-danger">{(caseMutation.error as Error).message}</p>
          ) : null}
        </section>

        <section className="mt-6 pb-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            AI response draft
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={tone}
              onChange={(event) => setTone(event.target.value as typeof tone)}
              className="rounded-xl border border-input bg-surface px-3 py-2 text-sm"
            >
              {["professional", "empathetic", "concise", "warm", "formal"].map((option) => (
                <option key={option} value={option} className="bg-popover">
                  {option}
                </option>
              ))}
            </select>
            <button
              onClick={() => draftMutation.mutate()}
              disabled={draftMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {draftMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 text-neon" />
              )}
              Generate reply
            </button>
          </div>
          {draftMutation.error ? (
            <p className="mt-2 text-sm text-danger">{(draftMutation.error as Error).message}</p>
          ) : null}
          {draft ? (
            <>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={7}
                className="mt-3 w-full rounded-xl border border-input bg-surface p-3 text-sm"
              />
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(draft);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
              >
                {copied ? "Copied" : "Copy reply"}
              </button>
            </>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
