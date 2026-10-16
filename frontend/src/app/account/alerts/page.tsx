"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ALERT_MAX_ACTIVE,
  INDIAN_METRO_CITIES,
  type TicketAlert,
  type TicketAlertSaveResult,
  type TicketAlertStatus,
  type TicketAlertWithMatches,
} from "@grabmyseats/shared";
import { useAuth } from "@/context/AuthContext";
import { CATEGORY_LABEL } from "@/lib/category";
import { describeAlertDates } from "@/lib/alertDates";
import { ApiError, deleteAlert, fetchMyAlerts, markAlertsSeen, pauseAlert, resumeAlert } from "@/lib/api";
import { ErrorText } from "@/components/ui/ErrorText";
import { AlertForm } from "@/components/alerts/AlertForm";
import { AlertMatchList } from "@/components/alerts/AlertMatchList";
import { NotificationPrompt } from "@/components/push/NotificationPrompt";

const STATUS_LABEL: Record<TicketAlertStatus, string> = { active: "Active", paused: "Paused", expired: "Ended" };
const STATUS_CLASS: Record<TicketAlertStatus, string> = {
  active: "border-gold/40 bg-gold/10 text-gold",
  paused: "border-muted/40 bg-muted/10 text-muted",
  expired: "border-muted/40 bg-muted/10 text-muted",
};

function describePlace(alert: TicketAlert): string {
  if (alert.lat !== null) return `within ${alert.radiusKm} km`;
  if (alert.cityId) return `in ${INDIAN_METRO_CITIES.find((c) => c.id === alert.cityId)?.name ?? alert.cityId}`;
  return "anywhere";
}

// My Alerts: every ticket alert with the listings it matched (the in-app
// side of alert notifications - website users and anyone without push see
// matches here), plus create / edit / pause / resume / delete. Opening the
// page marks matches seen, which clears the dot on Account.
export default function AlertsPage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [alerts, setAlerts] = useState<TicketAlertWithMatches[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<TicketAlertSaveResult | null>(null);
  // Only a newly created alert asks about notifications - not an edit.
  const [justCreated, setJustCreated] = useState(false);
  // Matches that were unseen when this page was opened stay "New" for the
  // whole visit, even after they're marked seen and the list reloads.
  const [newThisVisit, setNewThisVisit] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) router.replace("/login");
  }, [isAuthLoading, isAuthenticated, router]);

  async function load() {
    try {
      const { alerts } = await fetchMyAlerts();
      setAlerts(alerts);
      const unseen = alerts.flatMap((a) => a.matches.filter((m) => !m.seen).map((m) => `${a.id}:${m.listingId}`));
      if (unseen.length > 0) setNewThisVisit((prev) => new Set(Array.from(prev).concat(unseen)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your alerts.");
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    // Load first (so "New" still shows on this visit), then mark seen.
    load().then(() => markAlertsSeen().catch(() => {}));
  }, [isAuthenticated]);

  async function act(id: string, action: () => Promise<unknown>, failure: string) {
    setError(null);
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaved(result: TicketAlertSaveResult) {
    setJustCreated(isCreating);
    setJustSaved(result);
    setIsCreating(false);
    setEditingId(null);
    await load();
  }

  if (isAuthLoading || !isAuthenticated) {
    return <main className="flex min-h-dvh items-center justify-center bg-background text-muted">Loading...</main>;
  }

  const activeCount = alerts?.filter((a) => a.status === "active").length ?? 0;
  const atLimit = activeCount >= ALERT_MAX_ACTIVE;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center justify-between">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-foreground">← Account</Link>
        <span className="font-display text-2xl tracking-wide text-gold">My Alerts</span>
      </header>

      <div className="mt-6 w-full max-w-sm flex-1">
        <ErrorText>{error}</ErrorText>

        {justSaved && (
          <div className="mb-4 rounded-lg border border-line bg-surface p-4">
            <p className="text-sm text-success">Alert saved ✓</p>
            {justCreated && <NotificationPrompt />}
            {justSaved.currentMatches.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-foreground">Already available</p>
                <AlertMatchList matches={justSaved.currentMatches} />
              </div>
            )}
          </div>
        )}

        {isCreating ? (
          <div className="mb-4 rounded-lg border border-line bg-surface p-4">
            <p className="mb-3 text-sm font-medium text-foreground">New alert</p>
            <AlertForm onSaved={handleSaved} onCancel={() => setIsCreating(false)} />
          </div>
        ) : (
          alerts !== null && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => { setIsCreating(true); setJustSaved(null); }}
                disabled={atLimit}
                className="w-full rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-[#1a1408] hover:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-50"
              >
                New alert
              </button>
              {atLimit && (
                <p className="mt-1.5 text-xs text-muted">
                  You have {ALERT_MAX_ACTIVE} active alerts, the most allowed. Pause or delete one to add another.
                </p>
              )}
            </div>
          )
        )}

        {!error && alerts === null && <p className="text-center text-sm text-muted">Loading...</p>}

        {alerts !== null && alerts.length === 0 && !isCreating && (
          <p className="mt-6 text-center text-sm text-muted">
            No alerts yet. Create one to hear when tickets you want are listed.
          </p>
        )}

        {alerts !== null && alerts.length > 0 && (
          <ul className="flex flex-col gap-3">
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                {editingId === alert.id ? (
                  <AlertForm initial={alert} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-medium text-foreground">{alert.titleQuery}</p>
                      <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[alert.status]}`}>
                        {STATUS_LABEL[alert.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {CATEGORY_LABEL[alert.category]} · {alert.seatsWanted} ticket{alert.seatsWanted === 1 ? "" : "s"} · {describePlace(alert)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{describeAlertDates(alert.dates)}</p>

                    {alert.matches.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-2 text-xs font-medium text-foreground">Matches</p>
                        <AlertMatchList
                          matches={alert.matches.map((m) => ({ ...m, seen: m.seen && !newThisVisit.has(`${alert.id}:${m.listingId}`) }))}
                        />
                      </div>
                    )}

                    {confirmDeleteId === alert.id ? (
                      <div className="mt-3 flex items-center gap-3 text-xs">
                        <span className="text-foreground">Delete this alert?</span>
                        <button type="button" disabled={busyId === alert.id}
                          onClick={() => act(alert.id, () => deleteAlert(alert.id), "Couldn't delete that alert.").then(() => setConfirmDeleteId(null))}
                          className="font-medium text-error disabled:opacity-60">Delete</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="font-medium text-muted">Keep</button>
                      </div>
                    ) : (
                      <div className="mt-3 flex gap-4 text-xs font-medium">
                        <button type="button" onClick={() => { setEditingId(alert.id); setJustSaved(null); }} className="text-muted hover:text-foreground">Edit</button>
                        {alert.status === "active" && (
                          <button type="button" disabled={busyId === alert.id}
                            onClick={() => act(alert.id, () => pauseAlert(alert.id), "Couldn't pause that alert.")}
                            className="text-muted hover:text-foreground disabled:opacity-60">Pause</button>
                        )}
                        {alert.status === "paused" && (
                          <button type="button" disabled={busyId === alert.id}
                            onClick={() => act(alert.id, () => resumeAlert(alert.id), "Couldn't resume that alert.")}
                            className="text-muted hover:text-foreground disabled:opacity-60">Resume</button>
                        )}
                        <button type="button" onClick={() => setConfirmDeleteId(alert.id)} className="text-muted hover:text-error">Delete</button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
