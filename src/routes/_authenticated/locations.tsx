import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { deleteLocation, upsertLocation } from "@/lib/workspace.functions";
import { getBusinessStats } from "@/lib/reviews.functions";
import { useWorkspace } from "@/components/workspace";
import { BusinessGate } from "@/components/business-gate";
import { GooglePanel } from "@/components/google-panel";

import { EmptyState, KpiCard, PageHeader, Panel } from "@/components/ui-kit";
import type { LocationRow } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/locations")({
  head: () => ({
    meta: [
      { title: "Locations — OrbitRep" },
      {
        name: "description",
        content:
          "Manage every Google Business Profile location in the workspace and map reviews to the right storefront.",
      },
      { property: "og:title", content: "Locations — OrbitRep" },
      {
        property: "og:description",
        content: "Multi-location Google Business Profile management for reputation workflows.",
      },
    ],
  }),
  component: () => (
    <BusinessGate>
      <LocationsPage />
    </BusinessGate>
  ),
});

type Draft = {
  id: string | null;
  name: string;
  address: string;
  city: string;
  country: string;
  google_place_id: string;
};

const emptyDraft: Draft = { id: null, name: "", address: "", city: "", country: "", google_place_id: "" };

function LocationsPage() {
  const { activeBusiness, locations, refresh } = useWorkspace();
  const businessId = activeBusiness?.id ?? "";
  const queryClient = useQueryClient();
  const save = useServerFn(upsertLocation);
  const remove = useServerFn(deleteLocation);
  const fetchReport = useServerFn(getBusinessReport);
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["report", businessId, "all"],
    queryFn: () => fetchReport({ data: { businessId, days: null } }),
    enabled: Boolean(businessId),
    staleTime: 60_000,
  });

  const perLocation = useMemo(() => {
    const map = new Map<string, { reviews: number; avg: number; flagged: number; cases: number }>();
    for (const row of stats?.locations ?? []) {
      map.set(row.id, {
        reviews: Number(row.reviews),
        avg: Number(row.avg_rating),
        flagged: Number(row.flagged),
        cases: Number(row.cases),
      });
    }
    return map;
  }, [stats]);

  const saveMutation = useMutation({
    mutationFn: (value: Draft) =>
      save({
        data: {
          id: value.id,
          business_id: businessId,
          name: value.name.trim(),
          address: value.address.trim() || null,
          city: value.city.trim() || null,
          country: value.country.trim() || null,
          google_place_id: value.google_place_id.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Location saved");
      setDraft(null);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Location removed");
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        icon="locations"
        title="Locations"
        subtitle={`Every storefront under ${(activeBusiness?.name ?? "your workspace")}. Reviews and cases are attributed per location.`}
        actions={
          <button
            onClick={() => setDraft(emptyDraft)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Add location
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Locations" value={locations.length} icon="locations" />
        <KpiCard label="Reviews mapped" value={stats?.reviews.length ?? 0} tone="neon" icon="reviews" />
        <KpiCard label="Open cases" value={stats?.cases.length ?? 0} tone="magenta" icon="cases" />
      </div>

      <GooglePanel
        businessId={businessId}
        locations={locations}
        onChanged={() => {
          refresh();
          void queryClient.invalidateQueries({ queryKey: ["workspace"] });
          void queryClient.invalidateQueries({ queryKey: ["stats", businessId] });
        }}
      />


      {draft ? (
        <Panel className="mt-6 p-5">
          <h2 className="font-display text-lg font-semibold">
            {draft.id ? "Edit location" : "New location"}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
            <Field
              label="Google Place ID"
              value={draft.google_place_id}
              onChange={(v) => setDraft({ ...draft, google_place_id: v })}
            />
            <Field label="Address" value={draft.address} onChange={(v) => setDraft({ ...draft, address: v })} />
            <Field label="City" value={draft.city} onChange={(v) => setDraft({ ...draft, city: v })} />
            <Field label="Country" value={draft.country} onChange={(v) => setDraft({ ...draft, country: v })} />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              disabled={!draft.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate(draft)}
              className="rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {saveMutation.isPending ? "Saving…" : "Save location"}
            </button>
            <button onClick={() => setDraft(null)} className="glass rounded-xl px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </Panel>
      ) : null}

      {locations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="locations"
            title="No locations yet"
            description="Add each Google Business Profile location so imported reviews can be attributed and benchmarked separately."
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((location: LocationRow) => {
            const metrics = perLocation.get(location.id);
            return (
              <Panel key={location.id} hover className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-semibold">{location.name}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {[location.address, location.city, location.country].filter(Boolean).join(", ") ||
                        "No address set"}
                    </p>
                  </div>
                  <button
                    aria-label={`Delete ${location.name}`}
                    onClick={() => deleteMutation.mutate(location.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Reviews" value={metrics?.reviews ?? 0} />
                  <Metric label="Avg" value={metrics?.avg ? metrics.avg.toFixed(1) : "—"} />
                  <Metric label="Flagged" value={metrics?.flagged ?? 0} />
                </div>

                <p className="mt-3 truncate text-[11px] text-muted-foreground">
                  Place ID: {location.google_place_id ?? "not linked"}
                </p>

                <button
                  onClick={() =>
                    setDraft({
                      id: location.id,
                      name: location.name,
                      address: location.address ?? "",
                      city: location.city ?? "",
                      country: location.country ?? "",
                      google_place_id: location.google_place_id ?? "",
                    })
                  }
                  className="glass mt-4 w-full rounded-xl px-3 py-2 text-sm font-medium hover:neon-outline"
                >
                  Edit details
                </button>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="glass mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:neon-outline"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-2 p-2">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
