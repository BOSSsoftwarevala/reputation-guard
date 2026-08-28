import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNotifications, markNotificationsRead } from "@/lib/workspace.functions";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Panel } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — OrbitRep" },
      {
        name: "description",
        content: "Real-time alerts for new violations, case status changes, appeals and completed scans.",
      },
      { property: "og:title", content: "Notifications — OrbitRep" },
      { property: "og:description", content: "Alerts for violations, case updates and finished AI scans." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const fetchAll = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchAll(),
  });

  const mutation = useMutation({
    mutationFn: () => markRead({ data: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = data ?? [];
  const unread = items.filter((item) => !item.is_read).length;

  return (
    <div>
      <PageHeader
        icon="alerts"
        title="Notifications"
        subtitle={unread ? `${unread} unread alert${unread === 1 ? "" : "s"}.` : "You're all caught up."}
        actions={
          unread ? (
            <button
              onClick={() => mutation.mutate()}
              className="glass rounded-xl px-4 py-2 text-sm font-medium"
            >
              Mark all read
            </button>
          ) : null
        }
      />

      {isLoading ? (
        <LoadingBlock label="Loading alerts" />
      ) : error ? (
        <ErrorBlock message={(error as Error).message} retry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="alerts"
          title="No notifications yet"
          description="Imports, AI scans and case status changes will show up here."
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Panel
              key={item.id}
              className={`p-4 ${item.is_read ? "opacity-70" : "neon-outline"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{item.title}</p>
                  {item.body ? (
                    <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  ) : null}
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
