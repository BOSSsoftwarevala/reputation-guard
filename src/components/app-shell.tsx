import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, ChevronDown, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Icon3D, type Icon3DName } from "@/components/icon-3d";
import { ThemeToggle } from "@/components/theme";
import { useWorkspace } from "@/components/workspace";
import { listNotifications } from "@/lib/workspace.functions";

const NAV: { to: string; label: string; icon: Icon3DName }[] = [
  { to: "/dashboard", label: "Command center", icon: "dashboard" },
  { to: "/reviews", label: "Reviews", icon: "reviews" },
  { to: "/scanner", label: "AI scanner", icon: "scanner" },
  { to: "/cases", label: "Removal cases", icon: "cases" },
  { to: "/analytics", label: "Analytics", icon: "analytics" },
  { to: "/locations", label: "Locations", icon: "locations" },
  { to: "/reports", label: "Client reports", icon: "reports" },
  { to: "/notifications", label: "Notifications", icon: "alerts" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { businesses, activeBusiness, setActiveBusinessId } = useWorkspace();
  const navigate = useNavigate();
  const fetchNotifications = useServerFn(listNotifications);
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    refetchInterval: 60_000,
  });
  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="grid-bg min-h-screen">
      <div className="flex min-h-screen">
        <aside
          className={`glass fixed inset-y-0 left-0 z-50 w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 p-4 transition-transform lg:static lg:flex lg:translate-x-0 ${
            open ? "flex translate-x-0" : "hidden -translate-x-full"
          }`}
        >
          <div className="mb-6 flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet to-neon text-primary-foreground neon-outline">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="font-display text-lg font-bold leading-none">
                Orbit<span className="text-gradient">Rep</span>
                <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Reputation Intelligence
                </span>
              </span>
            </Link>
            <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground neon-outline"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon3D name={item.icon} size={26} />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/notifications" && unread > 0 ? (
                    <span className="rounded-full bg-magenta px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {unread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 space-y-2">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Workspace settings
            </Link>
            <div className="rounded-xl border border-border/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
              We assist with Google&apos;s official reporting and appeal workflow. Removal is decided by
              Google — never guaranteed.
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border/60 px-4 sm:px-6">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>

            <div className="relative">
              <select
                value={activeBusiness?.id ?? ""}
                onChange={(event) => setActiveBusinessId(event.target.value)}
                className="glass appearance-none rounded-xl py-2 pl-3 pr-9 text-sm font-medium outline-none focus:neon-outline"
                aria-label="Active business"
              >
                {businesses.length === 0 ? <option value="">No business yet</option> : null}
                {businesses.map((business) => (
                  <option key={business.id} value={business.id} className="bg-popover">
                    {business.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Link
                to="/notifications"
                className="glass relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:neon-outline"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-magenta px-1 text-[10px] font-bold text-primary-foreground">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
              <ThemeToggle />
              <button
                onClick={signOut}
                className="glass inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm transition-all hover:neon-outline"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
