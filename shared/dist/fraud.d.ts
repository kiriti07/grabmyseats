export type FraudReportStatus = "PENDING" | "REVIEWED" | "ACTIONED" | "DISMISSED";
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
