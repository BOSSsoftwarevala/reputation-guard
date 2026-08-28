import type { Database } from "@/integrations/supabase/types";

export type ViolationCategory = Database["public"]["Enums"]["violation_category"];
export type ReviewPriority = Database["public"]["Enums"]["review_priority"];
export type CaseStatus = Database["public"]["Enums"]["case_status"];
export type ScanStatus = Database["public"]["Enums"]["scan_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];
export type CaseRow = Database["public"]["Tables"]["removal_cases"]["Row"];
export type LocationRow = Database["public"]["Tables"]["locations"]["Row"];
export type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type ScanJobRow = Database["public"]["Tables"]["scan_jobs"]["Row"];

export const VIOLATION_LABELS: Record<ViolationCategory, string> = {
  spam: "Spam",
  fake_content: "Fake / manipulated content",
  off_topic: "Off-topic content",
  conflict_of_interest: "Competitor / conflict of interest",
  harassment: "Harassment",
  abuse: "Abuse",
  threats: "Threats",
  extortion: "Extortion",
  personal_information: "Personal information",
  promotional: "Promotional content",
  other: "Other policy concern",
  none: "No policy violation",
};

export const VIOLATION_ORDER: ViolationCategory[] = [
  "spam",
  "fake_content",
  "off_topic",
  "conflict_of_interest",
  "harassment",
  "abuse",
  "threats",
  "extortion",
  "personal_information",
  "promotional",
  "other",
  "none",
];

export const PRIORITY_LABELS: Record<ReviewPriority, string> = {
  high: "High",
  medium: "Medium",
  review_required: "Review required",
  normal: "Normal",
};

export const PRIORITY_HINT: Record<ReviewPriority, string> = {
  high: "Strong potential violation",
  medium: "Possible violation",
  review_required: "Human verification required",
  normal: "No clear violation",
};

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  evidence_ready: "Evidence ready",
  reported: "Reported",
  appeal: "Appeal",
  resolved: "Resolved",
  rejected: "Rejected",
};

export const CASE_STATUS_FLOW: CaseStatus[] = [
  "new",
  "reviewing",
  "evidence_ready",
  "reported",
  "appeal",
  "resolved",
  "rejected",
];

export const SCAN_BATCH_SIZE = 8;

export function ratingStars(rating: number) {
  return "★".repeat(Math.max(0, Math.min(5, rating))) + "☆".repeat(Math.max(0, 5 - rating));
}
