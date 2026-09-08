import type {
  ApiResponse,
  AdminUser,
  AdminUserSummary,
  AdminMetrics,
  CreateStaffInput,
  CreateStaffResult,
  FraudReport,
  FraudReportStatus,
  ManualReviewFlag,
  Transaction,
} from "@grabmyseats/shared";
import { API_BASE_URL } from "./config";
import { getAdminToken } from "./adminToken";
import { ApiError } from "./api";

export { ApiError };

function adminAuthHeaders(): HeadersInit {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readApiBody<T>(res: Response): Promise<T> {
  let body: ApiResponse<T> | undefined;
  try {
    body = await res.json();
  } catch {
    // fall through to the generic error below
  }

  if (!body) {
    throw new ApiError("Something went wrong. Please try again.", res.status);
  }
  if (!body.success) {
    throw new ApiError(body.error, res.status);
  }
  return body.data;
}

// Entirely separate request path from lib/api.ts's request() - that one
// attaches the customer bearer token (getToken()/gms_token). Admin calls
// must never accidentally ride on a customer session or vice versa.
async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...adminAuthHeaders(),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection.", 0);
  }
  return readApiBody<T>(res);
}

export function adminLogin(
  username: string,
  password: string,
): Promise<{ admin: AdminUser; token: string }> {
  return adminRequest("/api/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function adminLogout(): Promise<{ message: string }> {
  return adminRequest("/api/admin/auth/logout", { method: "POST" });
}

export function fetchAdminMe(): Promise<{ admin: AdminUser }> {
  return adminRequest("/api/admin/auth/me");
}

// ADMIN only.
export function createStaff(input: CreateStaffInput): Promise<CreateStaffResult> {
  return adminRequest("/api/admin/staff", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ADMIN only.
export function listStaff(): Promise<{ staff: AdminUser[] }> {
  return adminRequest("/api/admin/staff");
}

// ADMIN only.
export function setStaffActive(id: string, isActive: boolean): Promise<{ staff: AdminUser }> {
  return adminRequest(`/api/admin/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

// ADMIN only.
export function fetchAdminMetrics(): Promise<AdminMetrics> {
  return adminRequest("/api/admin/metrics");
}

// Everything below is reachable by both ADMIN and SUPPORT.

export function lookupUserByPhone(phone: string): Promise<{ user: AdminUserSummary | null }> {
  return adminRequest(`/api/admin/users?phone=${encodeURIComponent(phone)}`);
}

export function suspendUser(id: string, reason: string): Promise<{ user: AdminUserSummary }> {
  return adminRequest(`/api/admin/users/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function unsuspendUser(id: string): Promise<{ user: AdminUserSummary }> {
  return adminRequest(`/api/admin/users/${id}/unsuspend`, { method: "POST" });
}

export function fetchFraudReports(): Promise<{ reports: FraudReport[] }> {
  return adminRequest("/api/admin/fraud-reports");
}

export function resolveFraudReport(
  id: string,
  action: FraudReportStatus,
  options?: { suspend?: boolean; suspensionReason?: string },
): Promise<{ report: FraudReport }> {
  return adminRequest(`/api/admin/fraud-reports/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ action, ...options }),
  });
}

export function fetchReviewFlags(): Promise<{ flags: ManualReviewFlag[] }> {
  return adminRequest("/api/admin/review-flags");
}

export function refundTransaction(id: string): Promise<{ transaction: Transaction }> {
  return adminRequest(`/api/admin/transactions/${id}/refund`, { method: "POST" });
}
