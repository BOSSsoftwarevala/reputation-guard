import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createBusinessFromUrl } from "@/lib/workspace.functions";
import { startGoogleOAuth } from "@/lib/google.functions";
import { useWorkspace } from "@/components/workspace";
import { LoadingBlock, Panel } from "@/components/ui-kit";
import { Icon3D } from "@/components/icon-3d";
import { Loader2, ShieldCheck } from "lucide-react";
import { parseGoogleMapsUrl } from "@/lib/google-url";
import type { ReactNode } from "react";

/** Renders children only once the operator has at least one business workspace. */
export function BusinessGate({ children }: { children: ReactNode }) {
  const { loading, activeBusiness, refresh } = useWorkspace();
  const create = useServerFn(createBusinessFromUrl);
  const connect = useServerFn(startGoogleOAuth);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"idle" | "creating" | "redirecting">("idle");
  const [error, setError] = useState<string | null>(null);

  if (loading) return <LoadingBlock label="Loading workspace" />;
  if (activeBusiness) return <>{children}</>;

  // One-step onboarding: paste the Google Business URL, we create the workspace
  // automatically, then send the operator straight to Google's own "Allow" consent
  // screen. Everything after that (linking, importing reviews, AI scanning) runs
  // on its own — no manual forms in between.
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStep("creating");
    setError(null);
    try {
      const { name, placeId } = parseGoogleMapsUrl(url);
      const { business } = await create({ data: { url: url.trim(), name, placeId } });
      setStep("redirecting");
      const { url: authUrl } = await connect({ data: { businessId: business.id } });
      window.location.href = authUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that business.");
      setBusy(false);
      setStep("idle");
      refresh();
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Panel className="p-7">
        <Icon3D name="locations" size={64} className="float-slow" priority />
        <h1 className="mt-4 font-display text-2xl font-bold">Add your Google Business</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste your Google Maps / Google Business Profile link. We'll set everything up and ask you to
          allow access — the AI takes it from there: importing reviews, scanning for policy violations,
          and preparing removals automatically.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.google.com/maps/place/Your+Business…"
            className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm outline-none focus:neon-outline"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {step === "redirecting"
              ? "Opening Google sign-in…"
              : step === "creating"
                ? "Setting up your workspace…"
                : "Add business & continue with Google"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            You'll be asked to allow OrbitRep to read your Google Business Profile reviews. Nothing is
            changed on Google until you approve a removal.
          </p>
        </form>
      </Panel>
    </div>
  );
}
