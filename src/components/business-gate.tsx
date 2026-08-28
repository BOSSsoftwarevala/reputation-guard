import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createBusiness } from "@/lib/workspace.functions";
import { useWorkspace } from "@/components/workspace";
import { LoadingBlock, Panel } from "@/components/ui-kit";
import { Icon3D } from "@/components/icon-3d";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/** Renders children only once the operator has at least one business workspace. */
export function BusinessGate({ children }: { children: ReactNode }) {
  const { loading, activeBusiness, refresh } = useWorkspace();
  const create = useServerFn(createBusiness);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <LoadingBlock label="Loading workspace" />;
  if (activeBusiness) return <>{children}</>;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({ data: { name, industry: industry || null, website: website || null } });
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the business.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <Panel className="p-7">
        <Icon3D name="locations" size={64} className="float-slow" priority />
        <h1 className="mt-4 font-display text-2xl font-bold">Create your first business</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A business holds your locations, imported Google reviews, AI scans and removal cases.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Business name"
            className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm outline-none focus:neon-outline"
          />
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Industry (optional)"
            className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm outline-none focus:neon-outline"
          />
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="Website (optional)"
            className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-sm outline-none focus:neon-outline"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create business
          </button>
        </form>
      </Panel>
    </div>
  );
}
