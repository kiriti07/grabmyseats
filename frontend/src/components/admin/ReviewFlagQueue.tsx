"use client";

import { useEffect, useState } from "react";
import type { ManualReviewFlag } from "@grabmyseats/shared";
import { AdminButton } from "@/components/admin/AdminButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError, fetchReviewFlags, refundTransaction } from "@/lib/adminApi";

// Reachable by both ADMIN and SUPPORT - see requireRole(['ADMIN','SUPPORT'])
// on GET /api/admin/review-flags and POST /api/admin/transactions/:id/refund.
// Refunding a flagged transaction also auto-resolves the flag(s) tied to
// it server-side (see the comment on that route), so a successful refund
// here just drops the row from the list rather than needing a separate
// "resolve" call.
export function ReviewFlagQueue() {
  const [flags, setFlags] = useState<ManualReviewFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  useEffect(() => {
    fetchReviewFlags()
      .then(({ flags }) => setFlags(flags))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load flags."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleRefund(transactionId: string) {
    setRefundingId(transactionId);
    setError(null);
    try {
      await refundTransaction(transactionId);
      setFlags((prev) => prev.filter((f) => f.transactionId !== transactionId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't refund this transaction.");
    } finally {
      setRefundingId(null);
    }
  }

  if (isLoading) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div className="flex flex-col gap-3">
      <ErrorText>{error}</ErrorText>
      {flags.length === 0 && <p className="text-sm text-muted">No pending review flags.</p>}

      {flags.map((flag) => (
        <div
          key={flag.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-4"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{flag.reason}</p>
            <p className="mt-1 text-xs text-muted">
              Transaction {flag.transactionId} · ₹{flag.amountPaid} · order {flag.razorpayOrderId}
            </p>
          </div>
          <AdminButton
            variant="danger"
            onClick={() => handleRefund(flag.transactionId)}
            isLoading={refundingId === flag.transactionId}
          >
            Refund
          </AdminButton>
        </div>
      ))}
    </div>
  );
}
