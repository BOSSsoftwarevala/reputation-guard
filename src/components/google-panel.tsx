import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Link2Off, RefreshCw } from "lucide-react";
import {
  disconnectGoogle,
  getGoogleStatus,
  linkGoogleLocation,
  listGoogleLocations,
  startGoogleOAuth,
  syncGoogleReviews,
} from "@/lib/google.functions";
import { Panel } from "@/components/ui-kit";
import type { LocationRow } from "@/lib/domain";

export function GooglePanel({
  businessId,
  locations,
  onChanged,
}: {
  businessId: string;
  locations: LocationRow[];
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getGoogleStatus);
  const start = useServerFn(startGoogleOAuth);
  const stop = useServerFn(disconnectGoogle);
  const fetchGoogleLocations = useServerFn(listGoogleLocations);
  const link = useServerFn(linkGoogleLocation);
  const sync = useServerFn(syncGoogleReviews);
  const [showLinker, setShowLinker] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("google");
    if (!flag) return;
    if (flag === "connected") toast.success("Google Business Profile connected.");
    else toast.error(params.get("message") ?? "Google connection failed.");
    window.history.replaceState({}, "", window.location.pathname);
    void queryClient.invalidateQueries({ queryKey: ["google-status"] });
  }, [queryClient]);

  const { data: status, isLoading } = useQuery({
    queryKey: ["google-status", businessId],
    queryFn: () => fetchStatus({ data: { businessId } }),
    enabled: Boolean(businessId),
  });

  const connected = status?.connected ?? false;

  const { data: googleLocations, isFetching: loadingGoogle } = useQuery({
    queryKey: ["google-locations", businessId],
    queryFn: () => fetchGoogleLocations({ data: { businessId } }),
    enabled: Boolean(businessId) && connected && showLinker,
  });

  const connectMutation = useMutation({
    mutationFn: () => start({ data: { businessId } }),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => stop({ data: { businessId } }),
    onSuccess: () => {
      toast.success("Google account disconnected.");
      void queryClient.invalidateQueries({ queryKey: ["google-status"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const linkMutation = useMutation({
    mutationFn: (vars: { locationId: string; googleResourceName: string | null }) =>
      link({ data: { businessId, ...vars } }),
    onSuccess: () => {
      toast.success("Location link updated.");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const syncMutation = useMutation({
    mutationFn: () => sync({ data: { businessId } }),
    onSuccess: (summary) => {
      toast.success(
        `Synced ${summary.fetched} reviews — ${summary.inserted} new, ${summary.updated} updated, ${summary.disappeared} removed from Google.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["google-status"] });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Panel className="mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Google Business Profile sync</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {isLoading
              ? "Checking connection…"
              : connected
                ? `Connected as ${status?.googleEmail ?? "Google account"}${
                    status?.lastSyncAt
                      ? ` · last sync ${new Date(status.lastSyncAt).toLocaleString()}`
                      : " · not synced yet"
                  }`
                : "Connect the Google account that manages these locations to pull live reviews automatically instead of importing CSV files."}
          </p>
          {connected && status?.lastSyncError ? (
            <p className="mt-2 text-xs text-danger">Last sync error: {status.lastSyncError}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                {syncMutation.isPending ? "Syncing…" : "Sync now"}
              </button>
              <button
                onClick={() => setShowLinker((v) => !v)}
                className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium hover:neon-outline"
              >
                <Link2 className="h-4 w-4" /> Link locations
              </button>
              <button
                onClick={() => disconnectMutation.mutate()}
                className="glass inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:text-danger"
              >
                <Link2Off className="h-4 w-4" /> Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || !businessId}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {connectMutation.isPending ? "Redirecting…" : "Connect Google"}
            </button>
          )}
        </div>
      </div>

      {connected && showLinker ? (
        <div className="mt-5 space-y-3 border-t border-border/60 pt-4">
          {loadingGoogle ? (
            <p className="text-sm text-muted-foreground">Loading Google locations…</p>
          ) : (googleLocations ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Google locations were returned for this account. Confirm the account manages Business
              Profile locations and that API access is approved.
            </p>
          ) : (
            locations.map((location) => (
              <div key={location.id} className="flex flex-wrap items-center gap-3">
                <span className="min-w-[180px] text-sm font-medium">{location.name}</span>
                <select
                  aria-label={`Google location for ${location.name}`}
                  value={location.google_resource_name ?? ""}
                  onChange={(event) =>
                    linkMutation.mutate({
                      locationId: location.id,
                      googleResourceName: event.target.value || null,
                    })
                  }
                  className="glass flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                >
                  <option value="" className="bg-popover">
                    Not linked
                  </option>
                  {(googleLocations ?? []).map((g) => (
                    <option key={g.name} value={g.name} className="bg-popover">
                      {g.title} {g.address ? `— ${g.address}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>
      ) : null}
    </Panel>
  );
}
