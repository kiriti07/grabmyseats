"use client";

import { useAdminAuth } from "@/context/AdminAuthContext";
import { MetricsCards } from "@/components/admin/MetricsCards";
import { StaffManagement } from "@/components/admin/StaffManagement";
import { FraudReportQueue } from "@/components/admin/FraudReportQueue";
import { ReviewFlagQueue } from "@/components/admin/ReviewFlagQueue";
import { UserSuspendPanel } from "@/components/admin/UserSuspendPanel";

// Role-aware: ADMIN sees metrics + staff management on top of everything
// SUPPORT sees (the fraud-report queue, review-flag queue, and the
// suspend/unsuspend action) - see requireRole(['ADMIN']) vs
// requireRole(['ADMIN','SUPPORT']) on the backend routes each section
// calls.
export default function AdminDashboardPage() {
  const { admin } = useAdminAuth();
  const isAdmin = admin?.role === "ADMIN";

  return (
    <div className="flex flex-col gap-10">
      {isAdmin && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Metrics</h2>
          <MetricsCards />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">
          Suspend / unsuspend a user
        </h2>
        <UserSuspendPanel />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">Fraud reports</h2>
        <FraudReportQueue />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">Manual review flags</h2>
        <ReviewFlagQueue />
      </section>

      {isAdmin && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Staff</h2>
          <StaffManagement />
        </section>
      )}
    </div>
  );
}
