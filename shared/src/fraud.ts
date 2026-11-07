export type FraudReportStatus = "PENDING" | "REVIEWED" | "ACTIONED" | "DISMISSED";

// What kind of problem a report is about - the report form's picker, in
// this order. Reports filed before the picker existed are all FRAUD.
export const FRAUD_REPORT_REASONS = ["FRAUD", "OFFENSIVE", "HARASSMENT", "OTHER"] as const;
export type FraudReportReason = (typeof FRAUD_REPORT_REASONS)[number];

export const FRAUD_REPORT_REASON_LABELS: Record<FraudReportReason, string> = {
  FRAUD: "Scam or fake ticket",
  OFFENSIVE: "Offensive content",
  HARASSMENT: "Harassment or threats",
  OTHER: "Something else",
};

export function isFraudReportReason(value: unknown): value is FraudReportReason {
  return typeof value === "string" && (FRAUD_REPORT_REASONS as readonly string[]).includes(value);
}

// GET /api/admin/fraud-reports response shape - admin-only, so this
// intentionally exposes reporterId/reportedUserId directly (unlike
// anything buyer/seller-facing in this app).
export interface FraudReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  relatedTransactionId: string | null;
  reason: FraudReportReason;
  description: string;
  evidenceUrls: string[];
  status: FraudReportStatus;
  createdAt: string;
  reviewedAt: string | null;
}
