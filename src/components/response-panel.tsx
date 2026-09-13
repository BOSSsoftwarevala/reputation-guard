import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Send, Sparkles, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  createResponseDraft,
  deleteResponseDraft,
  listReviewResponses,
  markResponseSent,
  setResponseApproval,
  updateResponseDraft,
} from "@/lib/responses.functions";

const TONES = ["professional", "empathetic", "concise", "warm", "formal"] as const;

export function ResponseStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "border-border bg-surface-2 text-muted-foreground",
    approved: "border-neon/40 bg-neon/10 text-neon",
    sent: "border-success/40 bg-success/10 text-success",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        map[status] ?? map["draft"]
      }`}
    >
      {status}
    </span>
  );
}

/** Full reply workflow for one review: generate → edit → approve → copy → send + tracking. */
export function ResponsePanel({ reviewId }: { reviewId: string }) {
  const queryClient = useQueryClient();
  const generate = useServerFn(createResponseDraft);
  const saveText = useServerFn(updateResponseDraft);
  const approve = useServerFn(setResponseApproval);
  const send = useServerFn(markResponseSent);
  const remove = useServerFn(deleteResponseDraft);
  const load = useServerFn(listReviewResponses);

  const [tone, setTone] = useState<(typeof TONES)[number]>("professional");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: responses, isLoading } = useQuery({
    queryKey: ["review-responses", reviewId],
    queryFn: () => load({ data: { reviewId } }),
  });

  useEffect(() => {
    setEdits({});
  }, [reviewId]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["review-responses", reviewId] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-responses"] });
  };

  const generateMutation = useMutation({
    mutationFn: () => generate({ data: { reviewId, tone } }),
    onSuccess: () => {
      toast.success("AI reply drafted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: string; text: string }) => saveText({ data: vars }),
    onSuccess: () => {
      toast.success("Reply saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approveMutation = useMutation({
    mutationFn: (vars: { id: string; approved: boolean }) => approve({ data: vars }),
    onSuccess: (_row, vars) => {
      toast.success(vars.approved ? "Reply approved" : "Moved back to draft");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMutation = useMutation({
    mutationFn: (vars: { id: string; channel: "google" | "manual" }) => send({ data: vars }),
    onSuccess: (_row, vars) => {
      toast.success(vars.channel === "google" ? "Published to Google" : "Marked as sent");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Draft deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tone}
          onChange={(event) => setTone(event.target.value as (typeof TONES)[number])}
          aria-label="Reply tone"
          className="rounded-xl border border-input bg-surface px-3 py-2 text-sm"
        >
          {TONES.map((option) => (
            <option key={option} value={option} className="bg-popover">
              {option}
            </option>
          ))}
        </select>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 text-neon" />
          )}
          Generate reply
        </button>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading replies…</p>
      ) : (responses ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No reply drafted yet. Generate one, edit it, approve it, then send it to Google.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {(responses ?? []).map((response) => {
          const value = edits[response.id] ?? response.draft_text;
          const dirty = value !== response.draft_text;
          const locked = response.status === "sent";
          return (
            <div key={response.id} className="rounded-xl border border-border/60 bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <ResponseStatusPill status={response.status} />
                <span className="capitalize">{response.tone}</span>
                <span>· {new Date(response.created_at).toLocaleString()}</span>
                {response.sent_at ? (
                  <span className="text-success">
                    · sent {new Date(response.sent_at).toLocaleDateString()}
                    {response.posted_to_google ? " on Google" : " manually"}
                  </span>
                ) : null}
              </div>

              <textarea
                value={value}
                readOnly={locked}
                rows={6}
                onChange={(event) => setEdits((prev) => ({ ...prev, [response.id]: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-input bg-surface p-3 text-sm read-only:opacity-80"
              />

              {response.google_error ? (
                <p className="mt-2 text-xs text-danger">{response.google_error}</p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-2">
                {!locked && dirty ? (
                  <button
                    onClick={() => saveMutation.mutate({ id: response.id, text: value })}
                    disabled={saveMutation.isPending}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                  >
                    Save edits
                  </button>
                ) : null}

                {!locked && response.status === "draft" ? (
                  <button
                    onClick={() => approveMutation.mutate({ id: response.id, approved: true })}
                    disabled={dirty || approveMutation.isPending}
                    title={dirty ? "Save your edits first" : undefined}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet to-neon px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                ) : null}

                {response.status === "approved" ? (
                  <>
                    <button
                      onClick={() => sendMutation.mutate({ id: response.id, channel: "google" })}
                      disabled={sendMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet to-magenta px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {sendMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Post to Google
                    </button>
                    <button
                      onClick={() => sendMutation.mutate({ id: response.id, channel: "manual" })}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                    >
                      Mark as sent
                    </button>
                    <button
                      onClick={() => approveMutation.mutate({ id: response.id, approved: false })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Back to draft
                    </button>
                  </>
                ) : null}

                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(value);
                    setCopiedId(response.id);
                    setTimeout(() => setCopiedId(null), 1600);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedId === response.id ? "Copied" : "Copy"}
                </button>

                {!locked ? (
                  <button
                    onClick={() => deleteMutation.mutate(response.id)}
                    aria-label="Delete draft"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
