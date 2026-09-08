// Internal staff (AdminUser) types - entirely separate from the
// customer-facing User in ./user.ts. See backend/src/routes/adminAuth.ts,
// adminStaff.ts, and middleware/adminAuth.ts.
export type AdminRole = "ADMIN" | "SUPPORT";

// Public shape of an AdminUser row - never carries passwordHash.
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

// POST /api/admin/staff request body (ADMIN only).
export interface CreateStaffInput {
  username: string;
  role: AdminRole;
}

// The temporary password is only ever present in this one response - it's
// generated server-side and not derivable from anything stored (only
// passwordHash is kept), so this is the one moment it exists in plaintext
// outside the requesting ADMIN's own memory. Hand it off out-of-band; it
// isn't shown again.
export interface CreateStaffResult {
  staff: AdminUser;
  temporaryPassword: string;
}

// GET /api/admin/users lookup result (phone search, for the
// suspend/unsuspend workflow) - unlike the customer-facing User shape in
// ./user.ts, this deliberately exposes suspendedAt/suspensionReason since
// it's what the admin dashboard's suspend action needs to decide which
// button to show and to display an existing reason.
export interface AdminUserSummary {
  id: string;
  phone: string;
  name: string | null;
  fullName: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
}

// GET /api/admin/metrics response (ADMIN only).
export interface AdminMetrics {
  activeUsers30d: number;
  activeListings: number;
  closedListings: number;
  pendingFraudReports: number;
  pendingReviewFlags: number;
  supportStaffCount: number;
}
