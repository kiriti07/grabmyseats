"use client";

import { useEffect, useState } from "react";
import type { FraudReport } from "@grabmyseats/shared";
import { AdminButton } from "@/components/admin/AdminButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError, fetchFraudReports, resolveFraudReport } from "@/lib/adminApi";

// Reachable by both ADMIN and SUPPORT - see requireRole(['ADMIN','SUPPORT'])
// on GET /api/admin/fraud-reports and POST .../resolve.
export function FraudReportQueue() {
  const [reports, setReports] = useState<FraudReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Report id currently showing its "suspend & mark actioned" reason field.
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    fetchFraudReports()
      .then(({ reports }) => setReports(reports))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load reports."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  async function handleDismiss(id: string) {
    setActingId(id);
    setError(null);
    try {
      await resolveFraudReport(id, "DISMISSED");
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't dismiss this report.");
    } finally {
      setActingId(null);
    }
  }

  async function handleActionAndSuspend(id: string) {
    if (!suspendReason.trim()) return;
    setActingId(id);
    setError(null);
    try {
      await resolveFraudReport(id, "ACTIONED", {
        suspend: true,
        suspensionReason: suspendReason.trim(),
      });
      setReports((prev) => prev.filter((r) => r.id !== id));
      setSuspendingId(null);
      setSuspendReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't resolve this report.");
    } finally {
      setActingId(null);
    }
  }

  if (isLoading) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div className="flex flex-col gap-3">
      <ErrorText>{error}</ErrorText>
      {reports.length === 0 && <p className="text-sm text-muted">No open fraud reports.</p>}

      {reports.map((report) => (
        <div key={report.id} className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs text-muted">
            Reported user: {report.reportedUserId} · Filed by: {report.reporterId}
          </p>
          <p className="mt-2 text-sm text-foreground">{report.description}</p>
          {report.evidenceUrls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {report.evidenceUrls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-info underline"
                >
                  Evidence
                </a>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <AdminButton
              variant="plain"
              onClick={() => handleDismiss(report.id)}
              isLoading={actingId === report.id && suspendingId !== report.id}
            >
              Dismiss
            </AdminButton>
            <AdminButton
              variant="danger"
              onClick={() => {
                setSuspendingId(report.id);
                setSuspendReason("");
              }}
            >
              Suspend & mark actioned
            </AdminButton>
          </div>

          {suspendingId === report.id && (
            <div className="mt-3 rounded-md border border-line bg-background p-3">
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Suspension reason"
                rows={2}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
              />
              <div className="mt-2 flex gap-2">
                <AdminButton
                  variant="danger"
                  onClick={() => handleActionAndSuspend(report.id)}
                  isLoading={actingId === report.id}
                  disabled={!suspendReason.trim()}
                >
                  Confirm suspend
                </AdminButton>
                <AdminButton variant="plain" onClick={() => setSuspendingId(null)}>
                  Cancel
                </AdminButton>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
