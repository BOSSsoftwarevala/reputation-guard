import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/components/workspace";
import { useTheme } from "@/components/theme";
import { PageHeader, Panel } from "@/components/ui-kit";
import {
  createBusiness,
  listTeam,
  updateBusiness,
  updateProfile,
} from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Workspace settings — OrbitRep" },
      {
        name: "description",
        content: "Manage your OrbitRep profile, businesses, team roles and appearance.",
      },
      { property: "og:title", content: "Workspace settings — OrbitRep" },
      { property: "og:description", content: "Manage your reputation workspace, team and businesses." },
    ],
  }),
  component: SettingsPage,
});

const inputClass =
  "w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm outline-none focus:neon-outline";

function SettingsPage() {
  const { businesses, activeBusiness, setActiveBusinessId, refresh, userId } = useWorkspace();

  return (
    <div>
      <PageHeader
        icon="dashboard"
        title="Workspace settings"
        subtitle="Profile, businesses, team access and appearance."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard />
        <AppearanceCard />
        <BusinessCard
          businesses={businesses}
          activeId={activeBusiness?.id ?? null}
          onSelect={setActiveBusinessId}
          onChanged={refresh}
        />
        <TeamCard businessId={activeBusiness?.id ?? null} ownerId={activeBusiness?.owner_id ?? null} userId={userId} />
        <Panel className="p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Compliance boundaries</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>• OrbitRep supports Google&apos;s official reporting and appeal workflow only.</li>
            <li>• Removal outcomes are decided by Google and can never be guaranteed.</li>
            <li>• Legitimate negative feedback is never eligible for a removal case.</li>
            <li>• AI analysis is decision support and always requires human review.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function ProfileCard() {
  const { profileName, email } = useProfile();
  const save = useServerFn(updateProfile);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  useEffect(() => setName(profileName ?? ""), [profileName]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { full_name: name.trim() || null } }),
    onSuccess: () => {
      toast.success("Profile updated");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Panel className="p-5">
      <h2 className="font-display text-lg font-semibold">Your profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">{email ?? "—"}</p>
      <label className="mt-4 block text-xs uppercase tracking-wider text-muted-foreground" htmlFor="full-name">
        Full name
      </label>
      <input
        id="full-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={`${inputClass} mt-1`}
        placeholder="Your name"
      />
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save profile
        </button>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </Panel>
  );
}

function useProfile() {
  const { userId } = useWorkspace();
  const [email, setEmail] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setEmail(data.user?.email ?? null);
      setProfileName(
        (data.user?.user_metadata?.["full_name"] as string | undefined) ?? null,
      );
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return { email, profileName };
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <Panel className="p-5">
      <h2 className="font-display text-lg font-semibold">Appearance</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Switch between the neon dark cockpit and the daylight theme.
      </p>
      <div className="mt-4 flex gap-2">
        {(["dark", "light"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`rounded-xl px-4 py-2 text-sm font-medium capitalize ${
              theme === value
                ? "bg-gradient-to-r from-violet to-neon text-primary-foreground"
                : "border border-border"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function BusinessCard({
  businesses,
  activeId,
  onSelect,
  onChanged,
}: {
  businesses: { id: string; name: string; industry: string | null; website: string | null }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const patch = useServerFn(updateBusiness);
  const create = useServerFn(createBusiness);
  const active = businesses.find((business) => business.id === activeId) ?? null;
  const [form, setForm] = useState({ name: "", industry: "", website: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setForm({
      name: active?.name ?? "",
      industry: active?.industry ?? "",
      website: active?.website ?? "",
    });
  }, [active?.id, active?.name, active?.industry, active?.website]);

  const saveMutation = useMutation({
    mutationFn: () =>
      patch({
        data: {
          id: activeId!,
          name: form.name.trim(),
          industry: form.industry.trim() || null,
          website: form.website.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Business updated");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => create({ data: { name } }),
    onSuccess: (business) => {
      toast.success("Business created");
      onChanged();
      onSelect(business.id);
      setCreating(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Businesses</h2>
        <button
          onClick={() => setCreating((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      <ul className="mt-3 space-y-2 text-sm">
        {businesses.map((business) => (
          <li key={business.id}>
            <button
              onClick={() => onSelect(business.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${
                business.id === activeId ? "border-neon/60 bg-surface-2" : "border-border/60 bg-surface-2"
              }`}
            >
              <span>{business.name}</span>
              {business.id === activeId ? (
                <span className="text-xs font-semibold text-neon">active</span>
              ) : null}
            </button>
          </li>
        ))}
        {businesses.length === 0 ? <li className="text-muted-foreground">No businesses yet.</li> : null}
      </ul>

      {creating ? (
        <NewBusinessForm
          pending={createMutation.isPending}
          onSubmit={(name) => createMutation.mutate(name)}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {active ? (
        <div className="mt-5 space-y-2 border-t border-border/60 pt-4">
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Business name"
            className={inputClass}
          />
          <input
            value={form.industry}
            onChange={(event) => setForm({ ...form, industry: event.target.value })}
            placeholder="Industry"
            className={inputClass}
          />
          <input
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
            placeholder="Website"
            className={inputClass}
          />
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!form.name.trim() || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-neon px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save business
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

function NewBusinessForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="mt-3 flex gap-2">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="New business name"
        className={inputClass}
      />
      <button
        onClick={() => onSubmit(name.trim())}
        disabled={!name.trim() || pending}
        className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
      >
        Add
      </button>
      <button onClick={onCancel} className="rounded-xl border border-border px-3 py-2 text-sm">
        Cancel
      </button>
    </div>
  );
}

function TeamCard({
  businessId,
  ownerId,
  userId,
}: {
  businessId: string | null;
  ownerId: string | null;
  userId: string | null;
}) {
  const fetchTeam = useServerFn(listTeam);
  const { data, isLoading } = useQuery({
    queryKey: ["team", businessId],
    queryFn: () => fetchTeam({ data: { businessId: businessId! } }),
    enabled: Boolean(businessId),
  });

  return (
    <Panel className="p-5">
      <h2 className="font-display text-lg font-semibold">Team access</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Everyone with access to this workspace. Owners can manage members and locations; analysts triage
        reviews and cases.
      </p>
      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading team…</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {(data ?? []).map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2 px-3 py-2"
            >
              <span>
                {member.profile?.full_name || member.profile?.email || member.user_id.slice(0, 8)}
                {member.user_id === userId ? (
                  <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                ) : null}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-neon">
                {member.user_id === ownerId ? "owner" : member.role}
              </span>
            </li>
          ))}
          {(data ?? []).length === 0 ? (
            <li className="text-muted-foreground">No teammates yet.</li>
          ) : null}
        </ul>
      )}
    </Panel>
  );
}
