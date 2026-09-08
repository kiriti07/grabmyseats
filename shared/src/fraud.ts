export type FraudReportStatus = "PENDING" | "REVIEWED" | "ACTIONED" | "DISMISSED";

// GET /api/admin/fraud-reports response shape - admin-only, so this
// intentionally exposes reporterId/reportedUserId directly (unlike
// anything buyer/seller-facing in this app).
export interface FraudReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  relatedTransactionId: string | null;
  description: string;
  evidenceUrls: string[];
  status: FraudReportStatus;
  createdAt: string;
  reviewedAt: string | null;
}
