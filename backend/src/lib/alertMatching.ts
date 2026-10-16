import { showtimeClockNow } from "@grabmyseats/shared";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma";
import { eventNamesMatch } from "./eventName";

// Which live listings match which ticket alerts (jobs/matchAlerts.ts, and
// routes/alerts.ts for the matches shown when an alert is created or
// edited). A listing matches an alert when ALL of:
// - same category, and the event names match (lib/eventName.ts);
// - the listing's showtime falls on one of the alert's dates (India
//   calendar days; an alert without dates - only ones created before dates
//   existed - takes any date);
// - the listing has at least seatsWanted free seats (available minus those
//   held by unexpired reservations);
// - the place matches: within radiusKm when the alert has a point, else the
//   listing's own city when it has a cityId, else anywhere;
// - the listing is live and its showtime still ahead, its seller is
//   neither suspended, deleted nor the Play reviewer, and it isn't the
//   alert owner's own listing;
// - the alert is active (not paused) and unexpired, and its owner neither
//   suspended nor deleted;
// - this alert has never been matched with this listing before (an
//   AlertNotification row for the pair - in any status - means it has).
//
// The database narrows the candidates by everything but the name; the name
// rule then runs here, on that short list.

export interface AlertMatch {
  alertId: string;
  userId: string;
  listingId: string;
  movieName: string;
  showtime: Date;
  freeSeats: number;
  cityId: string | null;
  alertHasPoint: boolean;
}

interface CandidateRow extends AlertMatch {
  titleQuery: string;
}

export async function findAlertMatches(
  filter: { alertIds?: string[]; listingIds?: string[] } = {},
  now: Date = new Date(),
): Promise<AlertMatch[]> {
  const alertFilter = filter.alertIds
    ? Prisma.sql`AND ta.id IN (${Prisma.join(filter.alertIds.length ? filter.alertIds : [""])})`
    : Prisma.empty;
  const listingFilter = filter.listingIds
    ? Prisma.sql`AND l.id IN (${Prisma.join(filter.listingIds.length ? filter.listingIds : [""])})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT ta.id AS "alertId", ta."userId", ta."titleQuery",
           l.id AS "listingId", l."movieName", l.showtime, l."cityId",
           (l."availableSeats" - l."reservedSeats") AS "freeSeats",
           (ta.location IS NOT NULL) AS "alertHasPoint"
    FROM "TicketAlert" ta
    JOIN "User" buyer ON buyer.id = ta."userId"
    JOIN "Listing" l ON l.category = ta.category
    JOIN "User" seller ON seller.id = l."sellerId"
    WHERE ta."isActive" = true
      AND ta."expiresAt" > ${now}
      AND buyer."suspendedAt" IS NULL AND buyer."deletedAt" IS NULL
      AND l.status IN ('ACTIVE', 'PARTIALLY_SOLD')
      -- showtime is India wall-clock time stored in UTC fields, so "now"
      -- is expressed the same way (see shared/src/showtime.ts).
      AND l.showtime > ${showtimeClockNow(now.getTime())}
      AND seller."suspendedAt" IS NULL AND seller."deletedAt" IS NULL
      AND seller."isReviewAccount" = false
      AND l."sellerId" <> ta."userId"
      AND (cardinality(ta.dates) IS NULL OR cardinality(ta.dates) = 0
           OR l.showtime::date = ANY(ta.dates))
      AND (l."availableSeats" - l."reservedSeats") >= ta."seatsWanted"
      AND (
        (ta.location IS NOT NULL AND ST_DWithin(ta.location, l."theaterLocation", ta."radiusKm" * 1000))
        OR (ta.location IS NULL AND ta."cityId" IS NOT NULL AND l."cityId" = ta."cityId")
        OR (ta.location IS NULL AND ta."cityId" IS NULL)
      )
      AND NOT EXISTS (
        SELECT 1 FROM "AlertNotification" an
        WHERE an."alertId" = ta.id AND an."listingId" = l.id
      )
      ${alertFilter}
      ${listingFilter}
  `;

  return rows
    .filter((row) => eventNamesMatch(row.titleQuery, row.movieName))
    .map(({ titleQuery: _titleQuery, ...match }) => ({ ...match, freeSeats: Number(match.freeSeats) }));
}
