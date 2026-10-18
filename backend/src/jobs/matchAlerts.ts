import { cityNameForId, showtimeClockNow } from "@grabmyseats/shared";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { findAlertMatches } from "../lib/alertMatching";
import { getPushSender, type PushMessage, type PushSender } from "../lib/push";

// Ticket-alert notifications. Two ways in, one code path:
// - the sweep, every 5 minutes (jobs/index.ts): every live listing;
// - instant: right after a listing is created or edited (routes/
//   listings.ts), that one listing, in the background once the response
//   has gone - never inside the seller's request (matchListingInBackground).
// Both run through matchAlerts() below, one run at a time in this process,
// with the same rules, cap and claim, so whichever finds a match first
// sends it and the other finds nothing new.
//
// 1. Match: every live listing against every usable alert
//    (lib/alertMatching.ts). Each new (alert, listing) pair gets one
//    AlertNotification row, PENDING. The row is unique per pair, so a pair
//    is notified at most once, ever: a listing that's edited later, or
//    gains seats, only notifies an alert it never matched before. Checking
//    every live listing (rather than only new ones) is what catches edits
//    and seats coming back from expired reservations.
// 2. Send, per user: pending matches still valid are combined into one push
//    (PushDelivery) to all the user's devices. At most PUSHES_PER_USER_PER_HOUR
//    pushes an hour - later matches wait and go out combined. No device, or
//    push switched off: IN_APP_ONLY (My Alerts shows them either way).
//
// Never twice: the delivery is marked SENDING before the call; at least one
// device accepting it makes it SENT; only an explicit temporary failure on
// every device is retried (RETRY, same delivery, up to MAX_ATTEMPTS); no
// answer at all (or a crash mid-send, found later as a stale SENDING) is
// SENT_UNCONFIRMED and never retried.

export const PUSHES_PER_USER_PER_HOUR = 3;
export const MAX_ATTEMPTS = 3;
const STALE_SENDING_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NAME_MAX = 40;

export interface MatchAlertsResult {
  // What the run looked at: usable alerts, and live listings still ahead.
  activeAlerts: number;
  candidateListings: number;
  matched: number;
  pushed: number;
  inAppOnly: number;
  skipped: number;
  // Why matches weren't pushed this run, in matches (push-off and no-device
  // add up to inAppOnly; noLongerValid is skipped).
  reasons: {
    pushOff: number;
    noDevice: number;
    rateLimited: number;
    claimLost: number;
    noLongerValid: number;
    sendFailed: number;
    unconfirmed: number;
    retrying: number;
  };
}

export type MatchAlertsSource = "sweep" | "instant";

// The job's log line (jobs/index.ts): counts only - no ids, names or tokens.
export function formatMatchAlertsLog(r: MatchAlertsResult, source: MatchAlertsSource): string {
  const reasons = [
    `push-off=${r.reasons.pushOff}`,
    `no-device=${r.reasons.noDevice}`,
    `rate-limited=${r.reasons.rateLimited}`,
    `claim-lost=${r.reasons.claimLost}`,
    `no-longer-valid=${r.reasons.noLongerValid}`,
    `send-failed=${r.reasons.sendFailed}`,
    `unconfirmed=${r.reasons.unconfirmed}`,
    `retrying=${r.reasons.retrying}`,
  ].join(", ");
  return (
    `[jobs] ticket alerts (${source}): checked ${r.activeAlerts} active alerts, ${r.candidateListings} candidate listings, ` +
    `${r.matched} new matches, ${r.pushed} pushes, ${r.inAppOnly} in-app only, ${r.skipped} skipped ` +
    `(reasons: ${reasons})`
  );
}

// Whether a run did anything worth a log line on its own.
export function matchAlertsFoundSomething(r: MatchAlertsResult): boolean {
  return r.matched + r.pushed + r.inAppOnly + r.skipped + Object.values(r.reasons).reduce((a, b) => a + b, 0) > 0;
}

interface PendingRow {
  id: string;
  userId: string;
  listingId: string;
  movieName: string;
  showtime: Date;
  freeSeats: number;
  alertCityId: string | null;
  alertHasPoint: boolean;
}

export interface MatchAlertsOptions {
  now?: Date;
  // Optional scoping by user, so tests sharing one database only ever touch
  // their own rows - the scheduled run always does everyone.
  userIds?: string[];
  // Instant path: match only these listings, then send only to the users
  // they matched.
  listingIds?: string[];
  sender?: PushSender | null;
}

// One run at a time in this process: the hourly-cap check and the claim
// then never interleave between the instant path and the sweep.
let runQueue: Promise<unknown> = Promise.resolve();

export function matchAlerts(options: MatchAlertsOptions = {}): Promise<MatchAlertsResult> {
  const run = runQueue.then(() => runMatchAlerts(options));
  runQueue = run.catch(() => {});
  return run;
}

// Instant runs whose response hasn't closed yet, or that are still running.
const instantInFlight = new Set<Promise<void>>();

// Resolves once every instant run scheduled so far, and every run queued,
// has finished (tests).
export async function alertMatchingIdle(): Promise<void> {
  await Promise.all(Array.from(instantInFlight));
  await runQueue;
}

const defaultInstantRunner = (listingId: string) => matchAlerts({ listingIds: [listingId] });
let instantRunner: (listingId: string) => Promise<MatchAlertsResult> = defaultInstantRunner;

// Tests only: make the instant path fail; null restores it.
export function setInstantMatchRunner(next: ((listingId: string) => Promise<MatchAlertsResult>) | null): void {
  instantRunner = next ?? defaultInstantRunner;
}

// Matches one listing once the seller's response has gone out (its
// "close" event). Never throws and never rejects: a failure is logged
// (name and code only) and the 5-minute sweep picks the listing up anyway.
export function matchListingInBackground(res: { once(event: "close", fn: () => void): unknown }, listingId: string): void {
  let done = () => {};
  const tracked = new Promise<void>((resolve) => (done = resolve));
  instantInFlight.add(tracked);
  void tracked.then(() => instantInFlight.delete(tracked));
  res.once("close", () => {
    setImmediate(() => {
      let run: Promise<MatchAlertsResult>;
      try {
        run = instantRunner(listingId);
      } catch (err) {
        run = Promise.reject(err);
      }
      run
        .then((result) => console.log(formatMatchAlertsLog(result, "instant")))
        .catch((err) => {
          const name = err instanceof Error ? err.name : "Error";
          const code = typeof (err as { code?: unknown })?.code === "string" ? ` ${(err as { code: string }).code}` : "";
          console.error(`[jobs] ticket alerts (instant) failed: ${name}${code}`);
        })
        .finally(done);
    });
  });
}

async function runMatchAlerts(options: MatchAlertsOptions): Promise<MatchAlertsResult> {
  const now = options.now ?? new Date();
  const sender = options.sender !== undefined ? options.sender : getPushSender();
  const result: MatchAlertsResult = {
    activeAlerts: 0,
    candidateListings: 0,
    matched: 0,
    pushed: 0,
    inAppOnly: 0,
    skipped: 0,
    reasons: {
      pushOff: 0, noDevice: 0, rateLimited: 0, claimLost: 0,
      noLongerValid: 0, sendFailed: 0, unconfirmed: 0, retrying: 0,
    },
  };

  // For the log: roughly what matching (lib/alertMatching.ts) starts from.
  result.activeAlerts = await prisma.ticketAlert.count({
    where: { ...(options.userIds ? { userId: { in: options.userIds } } : {}), isActive: true, expiresAt: { gt: now } },
  });
  result.candidateListings = await prisma.listing.count({
    where: {
      ...(options.listingIds ? { id: { in: options.listingIds } } : {}),
      status: { in: ["ACTIVE", "PARTIALLY_SOLD"] },
      showtime: { gt: showtimeClockNow(now.getTime()) },
    },
  });

  // 1. Match. The row is unique per (alert, listing): when the sweep and
  // the instant path find the same pair, only one insert counts.
  const matches = await findAlertMatches({ userIds: options.userIds, listingIds: options.listingIds }, now);
  if (matches.length > 0) {
    const created = await prisma.alertNotification.createMany({
      data: matches.map((m) => ({ alertId: m.alertId, listingId: m.listingId, status: "PENDING" as const, notifiedAt: now })),
      skipDuplicates: true,
    });
    result.matched = created.count;
  }

  // Instant path: send only to the users this listing matched (the sweep
  // looks after everyone else).
  let userIds = options.userIds;
  if (options.listingIds) {
    const matchedUsers = new Set(matches.map((m) => m.userId));
    userIds = (options.userIds ?? Array.from(matchedUsers)).filter((u) => matchedUsers.has(u));
    if (userIds.length === 0) return result;
  }
  const userScope = userIds ? { userId: { in: userIds } } : {};

  // A push that never finished (crash, timeout) - it may have gone out, so
  // it's never sent again.
  const stale = await prisma.pushDelivery.findMany({
    where: { ...userScope, status: "SENDING", createdAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
    select: { id: true },
  });
  for (const { id } of stale) await finishDelivery(id, "SENT_UNCONFIRMED", "SENT_UNCONFIRMED", now);

  // 2a. Retries of pushes every device turned away temporarily.
  const retries = await prisma.pushDelivery.findMany({ where: { ...userScope, status: "RETRY" } });
  for (const delivery of retries) {
    const rows = await validPendingRows(now, { deliveryId: delivery.id });
    // Matches that stopped being valid since (sold, paused, ...) drop out.
    const dropped = await prisma.alertNotification.updateMany({
      where: { deliveryId: delivery.id, status: "PENDING", id: { notIn: rows.map((r) => r.id) } },
      data: { status: "SKIPPED" },
    });
    result.skipped += dropped.count;
    result.reasons.noLongerValid += dropped.count;
    if (rows.length === 0) {
      await finishDelivery(delivery.id, "FAILED", "SKIPPED", now);
      continue;
    }
    await prisma.pushDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    await sendDelivery(sender, delivery.id, delivery.userId, rows, delivery.attempts + 1, now, result);
  }

  // 2b. New matches, per user.
  const stillInvalid = await skipInvalidPending(now, userIds);
  result.skipped += stillInvalid;
  result.reasons.noLongerValid += stillInvalid;
  const pending = await validPendingRows(now, { userIds, unassigned: true });
  const byUser = new Map<string, PendingRow[]>();
  for (const row of pending) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

  for (const [userId, rows] of byUser) {
    const tokens = await prisma.pushToken.count({ where: { userId } });
    if (!sender || tokens === 0) {
      await prisma.alertNotification.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, status: "PENDING", deliveryId: null },
        data: { status: "IN_APP_ONLY" },
      });
      result.inAppOnly += rows.length;
      if (!sender) result.reasons.pushOff += rows.length;
      else result.reasons.noDevice += rows.length;
      continue;
    }

    const recent = await prisma.pushDelivery.count({
      where: { userId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
    });
    if (recent >= PUSHES_PER_USER_PER_HOUR) {
      result.reasons.rateLimited += rows.length; // wait - combined into a later push
      continue;
    }

    const deliveryId = await claimRows(userId, rows, now);
    if (!deliveryId) {
      result.reasons.claimLost += rows.length; // another run got there first
      continue;
    }
    await sendDelivery(sender, deliveryId, userId, rows, 1, now, result);
  }

  return result;
}

// Creates the delivery and attaches the rows to it in one transaction - only
// rows still unassigned, so two overlapping runs can't both send them.
async function claimRows(userId: string, rows: PendingRow[], now: Date): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const delivery = await tx.pushDelivery.create({
      data: { userId, status: "SENDING", attempts: 1, matchCount: rows.length, createdAt: now },
    });
    const claimed = await tx.alertNotification.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, status: "PENDING", deliveryId: null },
      data: { deliveryId: delivery.id },
    });
    if (claimed.count !== rows.length) {
      throw new ClaimLostError();
    }
    return delivery.id;
  }).catch((err) => {
    if (err instanceof ClaimLostError) return null;
    throw err;
  });
}

class ClaimLostError extends Error {}

async function sendDelivery(
  sender: PushSender | null,
  deliveryId: string,
  userId: string,
  rows: PendingRow[],
  attempt: number,
  now: Date,
  result: MatchAlertsResult,
): Promise<void> {
  const tokens = (await prisma.pushToken.findMany({ where: { userId }, select: { token: true } })).map((t) => t.token);
  if (!sender || tokens.length === 0) {
    await finishDelivery(deliveryId, "FAILED", "IN_APP_ONLY", now);
    result.inAppOnly += rows.length;
    if (!sender) result.reasons.pushOff += rows.length;
    else result.reasons.noDevice += rows.length;
    return;
  }

  const outcomes = await sender.send(tokens, buildMessage(rows));

  const invalid = outcomes.filter((o) => o.outcome === "invalid-token").map((o) => o.token);
  if (invalid.length > 0) await prisma.pushToken.deleteMany({ where: { token: { in: invalid } } });

  const kinds = new Set(outcomes.map((o) => o.outcome));
  if (kinds.has("sent")) {
    await finishDelivery(deliveryId, "SENT", "SENT", now);
    result.pushed += 1;
  } else if (kinds.has("unknown")) {
    await finishDelivery(deliveryId, "SENT_UNCONFIRMED", "SENT_UNCONFIRMED", now);
    result.reasons.unconfirmed += rows.length;
  } else if (kinds.has("retryable") && attempt < MAX_ATTEMPTS) {
    await prisma.pushDelivery.update({ where: { id: deliveryId }, data: { status: "RETRY" } });
    result.reasons.retrying += rows.length;
  } else if (invalid.length === outcomes.length) {
    // Every device is gone: in-app only.
    await finishDelivery(deliveryId, "FAILED", "IN_APP_ONLY", now);
    result.inAppOnly += rows.length;
    result.reasons.noDevice += rows.length;
  } else {
    await finishDelivery(deliveryId, "FAILED", "FAILED", now);
    result.reasons.sendFailed += rows.length;
  }
}

async function finishDelivery(
  deliveryId: string,
  deliveryStatus: "SENT" | "SENT_UNCONFIRMED" | "FAILED",
  rowStatus: "SENT" | "SENT_UNCONFIRMED" | "FAILED" | "IN_APP_ONLY" | "SKIPPED",
  now: Date,
): Promise<void> {
  await prisma.$transaction([
    prisma.pushDelivery.update({
      where: { id: deliveryId },
      data: { status: deliveryStatus, sentAt: deliveryStatus === "FAILED" ? null : now },
    }),
    prisma.alertNotification.updateMany({
      where: { deliveryId, status: "PENDING" },
      data: { status: rowStatus },
    }),
  ]);
}

// The same rule as matching (lib/alertMatching.ts), minus the name (which
// can't have changed) and the "never matched before" part: whether a
// pending match is still worth a push right now.
const STILL_VALID = (now: Date) => Prisma.sql`
  ta."isActive" = true
  AND ta."expiresAt" > ${now}
  AND buyer."suspendedAt" IS NULL AND buyer."deletedAt" IS NULL
  AND l.status IN ('ACTIVE', 'PARTIALLY_SOLD')
  AND l.showtime > ${showtimeClockNow(now.getTime())}
  AND seller."suspendedAt" IS NULL AND seller."deletedAt" IS NULL
  AND (l."availableSeats" - l."reservedSeats") >= ta."seatsWanted"
`;

const PENDING_JOIN = Prisma.sql`
  FROM "AlertNotification" an
  JOIN "TicketAlert" ta ON ta.id = an."alertId"
  JOIN "User" buyer ON buyer.id = ta."userId"
  JOIN "Listing" l ON l.id = an."listingId"
  JOIN "User" seller ON seller.id = l."sellerId"
`;

async function skipInvalidPending(now: Date, userIds?: string[]): Promise<number> {
  const scope = userIds
    ? Prisma.sql`AND ta."userId" IN (${Prisma.join(userIds.length ? userIds : [""])})`
    : Prisma.empty;
  return prisma.$executeRaw`
    UPDATE "AlertNotification" SET status = 'SKIPPED'
    WHERE id IN (
      SELECT an.id ${PENDING_JOIN}
      WHERE an.status = 'PENDING' AND an."deliveryId" IS NULL
        AND NOT (${STILL_VALID(now)})
        ${scope}
    )
  `;
}

async function validPendingRows(
  now: Date,
  filter: { userIds?: string[]; unassigned?: boolean; deliveryId?: string },
): Promise<PendingRow[]> {
  const scope = filter.userIds
    ? Prisma.sql`AND ta."userId" IN (${Prisma.join(filter.userIds.length ? filter.userIds : [""])})`
    : Prisma.empty;
  const assignment = filter.deliveryId
    ? Prisma.sql`AND an."deliveryId" = ${filter.deliveryId}`
    : filter.unassigned
      ? Prisma.sql`AND an."deliveryId" IS NULL`
      : Prisma.empty;
  const rows = await prisma.$queryRaw<PendingRow[]>`
    SELECT an.id, ta."userId", l.id AS "listingId", l."movieName", l.showtime,
           (l."availableSeats" - l."reservedSeats") AS "freeSeats",
           ta."cityId" AS "alertCityId", (ta.location IS NOT NULL) AS "alertHasPoint"
    ${PENDING_JOIN}
    WHERE an.status = 'PENDING'
      AND ${STILL_VALID(now)}
      ${assignment}
      ${scope}
    ORDER BY an."notifiedAt", an.id
  `;
  return rows.map((r) => ({ ...r, freeSeats: Number(r.freeSeats) }));
}

// Event names are typed by sellers: one line, no links, at most NAME_MAX
// characters - our notification never carries anyone's free text as-is.
export function cleanEventName(name: string): string {
  const cleaned = name
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > NAME_MAX ? `${cleaned.slice(0, NAME_MAX - 1).trimEnd()}…` : cleaned;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// No personal data and nothing about the seller: event, date, seats, and
// where relative to the alert ("near you" / "in <city>").
export function buildMessage(rows: PendingRow[]): PushMessage {
  if (rows.length === 1) {
    const [row] = rows;
    // India wall-clock in the UTC fields (see shared/src/showtime.ts).
    const date = `${row.showtime.getUTCDate()} ${MONTHS[row.showtime.getUTCMonth()]}`;
    const seats = `${row.freeSeats} seat${row.freeSeats === 1 ? "" : "s"}`;
    const city = row.alertCityId ? cityNameForId(row.alertCityId) : null;
    const where = row.alertHasPoint ? " near you" : city ? ` in ${city}` : "";
    return {
      title: "Tickets available",
      body: `${cleanEventName(row.movieName)}, ${date} - ${seats}${where}`,
      path: `/buy/${row.listingId}`,
    };
  }

  // Soonest show first, then by name - a stable order for the same matches.
  const ordered = [...rows].sort(
    (a, b) =>
      a.showtime.getTime() - b.showtime.getTime() ||
      (a.movieName.toLowerCase() < b.movieName.toLowerCase() ? -1 : a.movieName.toLowerCase() > b.movieName.toLowerCase() ? 1 : 0),
  );
  const names = [...new Set(ordered.map((r) => cleanEventName(r.movieName)))];
  const shown = names.slice(0, 2);
  const more = names.length - shown.length;
  const list = more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(" and ");
  return {
    title: "Tickets available",
    body: `${rows.length} new matches: ${list}`,
    path: "/account/alerts",
  };
}
