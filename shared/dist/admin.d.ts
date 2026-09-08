export type AdminRole = "ADMIN" | "SUPPORT";
export interface AdminUser {
    id: string;
    username: string;
    role: AdminRole;
    isActive: boolean;
    createdByAdminId: string | null;
    createdAt: string;
}
export interface AdminLoginInput {
    username: string;
    password: string;
}
export interface CreateStaffInput {
    username: string;
    role: AdminRole;
}
export interface CreateStaffResult {
    staff: AdminUser;
    temporaryPassword: string;
}
export interface AdminUserSummary {
    id: string;
    phone: string;
    name: string | null;
    fullName: string | null;
    suspendedAt: string | null;
    suspensionReason: string | null;
    createdAt: string;
}
export interface AdminMetrics {
    activeUsers30d: number;
    activeListings: number;
    closedListings: number;
    pendingFraudReports: number;
    pendingReviewFlags: number;
    supportStaffCount: number;
}
