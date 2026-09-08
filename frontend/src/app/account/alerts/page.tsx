"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TicketAlert } from "@grabmyseats/shared";
import { INDIAN_METRO_CITIES } from "@grabmyseats/shared";
import { useAuth } from "@/context/AuthContext";
import { CATEGORY_LABEL } from "@/lib/category";
import { formatDateShort } from "@/lib/format";
import { ApiError, cancelAlert, fetchMyAlerts } from "@/lib/api";
import { ErrorText } from "@/components/ui/ErrorText";

function cityName(cityId: string | null): string | null {
  if (!cityId) return null;
  return INDIAN_METRO_CITIES.find((c) => c.id === cityId)?.name ?? null;
}

// "Active" here means the same thing a buyer means by it: still on
// (isActive) and not past expiresAt - not just the raw isActive column.
function alertState(alert: TicketAlert): "active" | "expired" | "cancelled" {
  if (!alert.isActive) return "cancelled";
  if (new Date(alert.expiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}

const STATE_LABEL: Record<ReturnType<typeof alertState>, string> = {
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
};

const STATE_CLASS: Record<ReturnType<typeof alertState>, string> = {
  active: "border-gold/40 bg-gold/10 text-gold",
  expired: "border-muted/40 bg-muted/10 text-muted",
  cancelled: "border-muted/40 bg-muted/10 text-muted",
};

export default function AlertsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [alerts, setAlerts] = useState<TicketAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchMyAlerts()
      .then(({ alerts }) => setAlerts(alerts))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Couldn't load your alerts.");
      });
  }, [isAuthenticated]);

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      const { alert } = await cancelAlert(id);
      setAlerts((prev) => (prev ? prev.map((a) => (a.id === id ? alert : a)) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel that alert.");
    } finally {
      setCancellingId(null);
    }
  }

  if (isAuthLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">
        Loading...
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center justify-between">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-foreground">
          ← Account
        </Link>
        <span className="font-display text-2xl tracking-wide text-gold">My Alerts</span>
      </header>

      <div className="mt-6 w-full max-w-sm flex-1">
        <ErrorText>{error}</ErrorText>

        {!error && alerts === null && (
          <p className="text-center text-sm text-muted">Loading...</p>
        )}

        {alerts !== null && alerts.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted">
              No saved alerts yet. Search on the Buy page and tap &quot;Notify me&quot; when
              nothing turns up.
            </p>
            <Link
              href="/buy"
              className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-[#1a1408] hover:bg-gold-dim"
            >
              Search tickets
            </Link>
          </div>
        )}

        {alerts !== null && alerts.length > 0 && (
          <ul className="flex flex-col gap-3">
            {alerts.map((alert) => {
              const state = alertState(alert);
              const city = cityName(alert.cityId);
              return (
                <li key={alert.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-foreground">{alert.titleQuery}</p>
                    <span
                      className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATE_CLASS[state]}`}
                    >
                      {STATE_LABEL[state]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {CATEGORY_LABEL[alert.category]} · within {alert.radiusKm}km
                    {city ? ` of ${city}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {state === "expired" ? "Expired" : "Expires"}{" "}
                    {formatDateShort(alert.expiresAt)}
                  </p>

                  {state === "active" && (
                    <button
                      type="button"
                      onClick={() => handleCancel(alert.id)}
                      disabled={cancellingId === alert.id}
                      className="mt-2 text-xs font-medium text-muted hover:text-error disabled:opacity-60"
                    >
                      {cancellingId === alert.id ? "Cancelling..." : "Cancel alert"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
