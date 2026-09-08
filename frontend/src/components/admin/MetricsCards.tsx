"use client";

import { useEffect, useState } from "react";
import type { AdminMetrics } from "@grabmyseats/shared";
import { ApiError, fetchAdminMetrics } from "@/lib/adminApi";

const CARDS: { key: keyof AdminMetrics; label: string }[] = [
  { key: "activeUsers30d", label: "Active users (30d)" },
  { key: "activeListings", label: "Active listings" },
  { key: "closedListings", label: "Closed listings" },
  { key: "pendingFraudReports", label: "Pending fraud reports" },
  { key: "pendingReviewFlags", label: "Pending review flags" },
  { key: "supportStaffCount", label: "Support staff" },
];

export function MetricsCards() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminMetrics()
      .then(setMetrics)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Couldn't load metrics.");
      });
  }, []);

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!metrics) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CARDS.map((card) => (
        <div key={card.key} className="rounded-lg border border-line bg-surface p-4">
          <p className="text-2xl font-semibold text-foreground">{metrics[card.key]}</p>
          <p className="mt-1 text-xs text-muted">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
