// Mirrors CHECK_IN_EARLY_WINDOW_MS/CHECK_IN_LATE_WINDOW_MS in
// backend/src/routes/transactions.ts - kept in sync manually since the
// window is computed client-side (to render "opens at.../closed" without a
// round trip) but ultimately enforced server-side on the actual check-in.
const CHECK_IN_EARLY_WINDOW_MS = 30 * 60 * 1000;
const CHECK_IN_LATE_WINDOW_MS = 20 * 60 * 1000;

export type CheckInWindowState = "before" | "open" | "closed";

export interface CheckInWindow {
  state: CheckInWindowState;
  opensAt: Date;
  closesAt: Date;
}

export function getCheckInWindow(showtimeIso: string): CheckInWindow {
  const showtimeMs = new Date(showtimeIso).getTime();
  const opensAt = new Date(showtimeMs - CHECK_IN_EARLY_WINDOW_MS);
  const closesAt = new Date(showtimeMs + CHECK_IN_LATE_WINDOW_MS);
  const now = Date.now();

  const state: CheckInWindowState =
    now < opensAt.getTime() ? "before" : now > closesAt.getTime() ? "closed" : "open";

  return { state, opensAt, closesAt };
}
