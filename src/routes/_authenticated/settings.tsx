import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, Panel } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Workspace settings — OrbitRep" },
      {
        name: "description",
        content: "Review your OrbitRep workspace, businesses and compliance boundaries.",
      },
      { property: "og:title", content: "Workspace settings — OrbitRep" },
      { property: "og:description", content: "Manage your reputation workspace and businesses." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { businesses, activeBusiness } = useWorkspace();

  return (
    <div>
      <PageHeader
        icon="dashboard"
        title="Workspace settings"
        subtitle="Businesses connected to this account."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="font-display text-lg font-semibold">Businesses</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {businesses.map((business) => (
              <li
                key={business.id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2 px-3 py-2"
              >
                <span>{business.name}</span>
                {business.id === activeBusiness?.id ? (
                  <span className="text-xs font-semibold text-neon">active</span>
                ) : null}
              </li>
            ))}
            {businesses.length === 0 ? (
              <li className="text-muted-foreground">No businesses yet.</li>
            ) : null}
          </ul>
        </Panel>

        <Panel className="p-5">
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
