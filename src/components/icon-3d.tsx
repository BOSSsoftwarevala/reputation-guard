import dashboard from "@/assets/icon-dashboard.png";
import reviews from "@/assets/icon-reviews.png";
import scanner from "@/assets/icon-scanner.png";
import cases from "@/assets/icon-cases.png";
import analytics from "@/assets/icon-analytics.png";
import locations from "@/assets/icon-locations.png";
import alerts from "@/assets/icon-alerts.png";
import reports from "@/assets/icon-reports.png";

export const ICONS_3D = {
  dashboard,
  reviews,
  scanner,
  cases,
  analytics,
  locations,
  alerts,
  reports,
} as const;

export type Icon3DName = keyof typeof ICONS_3D;

export function Icon3D({
  name,
  size = 28,
  className = "",
  priority = false,
}: {
  name: Icon3DName;
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={ICONS_3D[name]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      style={{ width: size, height: size }}
      className={`shrink-0 select-none object-contain drop-shadow-[0_6px_14px_color-mix(in_oklab,var(--primary)_45%,transparent)] ${className}`}
    />
  );
}
