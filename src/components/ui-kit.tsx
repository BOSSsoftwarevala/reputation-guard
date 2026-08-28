import type { ReactNode } from "react";
import { Icon3D, type Icon3DName } from "@/components/icon-3d";
import { Loader2 } from "lucide-react";

export function Panel({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={`card-3d ${hover ? "card-3d-hover" : ""} ${className}`}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: Icon3DName;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        {icon ? <Icon3D name={icon} size={46} className="float-slow" priority /> : null}
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "primary",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "primary" | "neon" | "magenta" | "success" | "warning" | "danger";
  icon?: Icon3DName;
}) {
  const toneRing: Record<string, string> = {
    primary: "from-primary/20",
    neon: "from-neon/20",
    magenta: "from-magenta/20",
    success: "from-success/20",
    warning: "from-warning/20",
    danger: "from-danger/20",
  };
  return (
    <Panel hover className="relative overflow-hidden p-5">
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${toneRing[tone]} to-transparent blur-2xl`}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? <Icon3D name={icon} size={38} /> : null}
      </div>
    </Panel>
  );
}

export function EmptyState({
  title,
  description,
  icon = "scanner",
  action,
}: {
  title: string;
  description: string;
  icon?: Icon3DName;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 px-6 py-16 text-center">
      <Icon3D name={icon} size={72} className="float-slow" />
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}…
    </div>
  );
}

export function ErrorBlock({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/40 bg-danger/8 p-6 text-center">
      <p className="font-display text-sm font-semibold text-danger">Something went wrong</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {retry ? (
        <button
          onClick={retry}
          className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="scan-line h-11 rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}
