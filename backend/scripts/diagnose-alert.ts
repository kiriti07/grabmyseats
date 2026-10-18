import "dotenv/config";
import { showtimeClockNow } from "@grabmyseats/shared";
import { prisma } from "../src/lib/prisma";
import { eventNamesMatch } from "../src/lib/eventName";
import { isPushRequested, loadServiceAccount, PushConfigError } from "../src/lib/push/config";
import { PUSHES_PER_USER_PER_HOUR } from "../src/jobs/matchAlerts";

// One-off, read-only: why a ticket alert and a listing do or don't match
// (the rules of lib/alertMatching.ts), and whether a match could be pushed.
// Usage, from backend/:
//   npx ts-node --transpile-only scripts/diagnose-alert.ts <alertId> <listingId>
//
// Everything runs in a READ ONLY transaction - Postgres refuses any write.
// Prints PASS/FAIL and counts only: never event names, emails, phone
// numbers, user ids or push tokens.

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

interface PairRow {
  buyerId: string;
  alertCategory: string;
  listingCategory: string;
  titleQuery: string;
  movieName: string;
  isActive: boolean;
  alertUnexpired: boolean;
  showDate: string;
  alertDates: string[] | null;
  datePass: boolean;
  freeSeats: number;
  seatsWanted: number;
  alertHasPoint: boolean;
  radiusKm: number;
  distanceKm: number | null;
  alertHasCity: boolean;
  listingHasCity: boolean;
  sameCity: boolean | null;
  placePass: boolean;
  ownListing: boolean;
  listingStatus: string;
  showtimeAhead: boolean;
  buyerSuspended: boolean;
  buyerDeleted: boolean;
  sellerSuspended: boolean;
  sellerDeleted: boolean;
  sellerIsReviewAccount: boolean;
}

function pushConfig(): string {
  if (!isPushRequested()) return "disabled (PUSH_NOTIFICATIONS_ENABLED is not \"true\")";
  try {
    loadServiceAccount();
    return "enabled";
  } catch (err) {
    // The message names the variable, never its value (lib/push/config.ts).
    return err instanceof PushConfigError ? `disabled (${err.message})` : "disabled (unexpected error)";
  }
}

async function main() {
  const [alertId, listingId] = process.argv.slice(2);
  if (!alertId || !listingId || !ID_RE.test(alertId) || !ID_RE.test(listingId)) {
    console.error("Usage: diagnose-alert.ts <alertId> <listingId>");
    process.exit(2);
  }

  const now = new Date();
  const clockNow = showtimeClockNow(now.getTime());

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

    const alertExists = (await tx.ticketAlert.count({ where: { id: alertId } })) > 0;
    const listingExists = (await tx.listing.count({ where: { id: listingId } })) > 0;
    console.log(`alert:   ${alertExists ? "found" : "NOT FOUND"}`);
    console.log(`listing: ${listingExists ? "found" : "NOT FOUND"}`);
    if (!alertExists || !listingExists) return;

    // The same conditions as lib/alertMatching.ts, one column each.
    const [r] = await tx.$queryRaw<PairRow[]>`
      SELECT
        ta."userId" AS "buyerId",
        ta.category::text AS "alertCategory", l.category::text AS "listingCategory",
        ta."titleQuery", l."movieName",
        ta."isActive", (ta."expiresAt" > ${now}) AS "alertUnexpired",
        to_char(l.showtime, 'YYYY-MM-DD') AS "showDate",
        (SELECT array_agg(to_char(d, 'YYYY-MM-DD') ORDER BY d) FROM unnest(ta.dates) d) AS "alertDates",
        (cardinality(ta.dates) IS NULL OR cardinality(ta.dates) = 0 OR l.showtime::date = ANY(ta.dates)) AS "datePass",
        (l."availableSeats" - l."reservedSeats")::int AS "freeSeats", ta."seatsWanted",
        (ta.location IS NOT NULL) AS "alertHasPoint", ta."radiusKm",
        CASE WHEN ta.location IS NOT NULL AND l."theaterLocation" IS NOT NULL
             THEN ST_Distance(ta.location, l."theaterLocation") / 1000 END AS "distanceKm",
        (ta."cityId" IS NOT NULL) AS "alertHasCity", (l."cityId" IS NOT NULL) AS "listingHasCity",
        (l."cityId" = ta."cityId") AS "sameCity",
        (
          (ta.location IS NOT NULL AND COALESCE(ST_DWithin(ta.location, l."theaterLocation", ta."radiusKm" * 1000), false))
          OR (ta.location IS NULL AND ta."cityId" IS NOT NULL AND COALESCE(l."cityId" = ta."cityId", false))
          OR (ta.location IS NULL AND ta."cityId" IS NULL)
        ) AS "placePass",
        (l."sellerId" = ta."userId") AS "ownListing",
        l.status::text AS "listingStatus", (l.showtime > ${clockNow}) AS "showtimeAhead",
        (buyer."suspendedAt" IS NOT NULL) AS "buyerSuspended", (buyer."deletedAt" IS NOT NULL) AS "buyerDeleted",
        (seller."suspendedAt" IS NOT NULL) AS "sellerSuspended", (seller."deletedAt" IS NOT NULL) AS "sellerDeleted",
        seller."isReviewAccount" AS "sellerIsReviewAccount"
      FROM "TicketAlert" ta
      JOIN "User" buyer ON buyer.id = ta."userId"
      CROSS JOIN "Listing" l
      JOIN "User" seller ON seller.id = l."sellerId"
      WHERE ta.id = ${alertId} AND l.id = ${listingId}
    `;

    const failed: string[] = [];
    const check = (name: string, pass: boolean, detail = "") => {
      if (!pass) failed.push(name);
      console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
    };

    const place = r.alertHasPoint
      ? `radius: ${r.distanceKm === null ? "listing has no theater location" : `${Number(r.distanceKm).toFixed(1)} km`} of ${r.radiusKm} km`
      : r.alertHasCity
        ? `city: ${r.listingHasCity ? (r.sameCity ? "same city" : "different city") : "listing has no city"}`
        : "anywhere";
    const dates = r.alertDates && r.alertDates.length > 0 ? r.alertDates.join(", ") : "any date";

    console.log("");
    check("category", r.alertCategory === r.listingCategory, `alert ${r.alertCategory}, listing ${r.listingCategory}`);
    check("event name rule", eventNamesMatch(r.titleQuery, r.movieName));
    check("date (Asia/Kolkata)", r.datePass, `show ${r.showDate}; alert ${dates}`);
    check("seats", Number(r.freeSeats) >= r.seatsWanted, `free ${r.freeSeats}, wanted ${r.seatsWanted}`);
    check("place", r.placePass, place);
    check("not own listing", !r.ownListing);
    check("alert active", r.isActive, r.isActive ? "" : "paused");
    check("alert unexpired", r.alertUnexpired);
    check("listing status", ["ACTIVE", "PARTIALLY_SOLD"].includes(r.listingStatus), r.listingStatus);
    check("showtime still ahead", r.showtimeAhead);
    check("buyer not suspended/deleted", !r.buyerSuspended && !r.buyerDeleted,
      [r.buyerSuspended && "suspended", r.buyerDeleted && "deleted"].filter(Boolean).join(", "));
    check("seller not suspended/deleted", !r.sellerSuspended && !r.sellerDeleted,
      [r.sellerSuspended && "suspended", r.sellerDeleted && "deleted"].filter(Boolean).join(", "));
    check("seller not the review account", !r.sellerIsReviewAccount);

    const notification = await tx.alertNotification.findFirst({
      where: { alertId, listingId },
      select: { status: true, notifiedAt: true, delivery: { select: { status: true, attempts: true } } },
    });
    check(
      "not already notified",
      !notification,
      notification
        ? `status ${notification.status} at ${notification.notifiedAt.toISOString()}; delivery ` +
            (notification.delivery ? `${notification.delivery.status}, ${notification.delivery.attempts} attempt(s)` : "none")
        : "",
    );

    console.log("");
    console.log(
      failed.length === 0
        ? "verdict: the job WOULD record this as a new match on its next run"
        : `verdict: no new match - failing: ${failed.join(", ")}`,
    );

    const tokens = await tx.pushToken.count({ where: { userId: r.buyerId } });
    const recentPushes = await tx.pushDelivery.count({
      where: { userId: r.buyerId, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    console.log("");
    console.log(`push config (this process): ${pushConfig()}`);
    console.log(`alert owner's PushToken rows: ${tokens}`);
    console.log(`pushes to alert owner in the last hour: ${recentPushes} (limit ${PUSHES_PER_USER_PER_HOUR})`);
  });
}

main()
  .catch((err) => {
    // The error's name and Prisma code only - its message can quote values.
    const code = typeof (err as { code?: unknown })?.code === "string" ? ` ${(err as { code: string }).code}` : "";
    console.error(`diagnose-alert failed: ${(err as Error)?.name ?? "Error"}${code}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
