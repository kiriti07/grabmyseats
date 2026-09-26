import { prisma } from "../lib/prisma";

// Moves live listings to EXPIRED once their showtime has passed, so a
// listing nobody bought stops lingering. GET /api/listings/search already
// filters on status IN ('ACTIVE', 'PARTIALLY_SOLD') (see ACTIVE_STATUSES
// in routes/listings.ts), so flipping the status here is by itself enough
// to drop these out of buyer-facing results - no query change needed
// there.
//
// Only ACTIVE/PARTIALLY_SOLD are touched. SOLD and WITHDRAWN are terminal
// states the seller set deliberately (POST /:id/mark-sold and
// POST /:id/deactivate), and a sold-out show whose showtime passes is
// still "sold", not "expired" - overwriting either would lose that
// distinction in the seller's own dashboard and in reporting.
//
// A single guarded bulk UPDATE rather than the per-candidate loop in
// expireReservations.ts/autoConfirmStaleEscrows.ts: those loop because
// each row needs its own side effect (seat release, per-row reason
// logging), whereas this is a pure status flip with nothing to do
// per row. The status IN (...) predicate in the WHERE clause is what makes
// it race-safe either way - Postgres re-evaluates it while holding the row
// lock, so a listing being marked SOLD/WITHDRAWN in the same instant
// either serializes ahead of this (and is then skipped, since it no longer
// matches) or lands after it. Same reasoning as the re-checked UPDATEs in
// the sibling jobs, just expressed as one statement.
// `asOf` is the cutoff a showtime must be at or before to count as passed.
// It defaults to now, which is what the scheduled run in jobs/index.ts
// uses - it's a parameter so a caller can pin the cutoff explicitly, which
// is what expireListings.test.ts does: this is one bulk UPDATE across the
// whole table, and the test suite shares a single Postgres across parallel
// vitest workers, so an unpinned run from a test would sweep up other
// files' fixtures (several create ACTIVE listings with showtime = now) and
// break them intermittently. Pinning the cutoff to a date no other fixture
// is anywhere near keeps the test's blast radius to its own rows.
export async function expireListings(asOf: Date = new Date()): Promise<number> {
  // A JS Date, not SQL now(): showtime is a timezone-naive TIMESTAMP(3)
  // holding literal wall-clock values written as UTC (see the showtime
  // comments in prisma/schema.prisma and lib/parseListingText.ts), so
  // comparing it against the DB server's now() would bring that server's
  // TimeZone setting into a calculation that deliberately has no timezone
  // in it anywhere else. Matches how autoConfirmStaleEscrows.ts compares
  // showtime against a JS Date.
  return prisma.$executeRaw`
    UPDATE "Listing"
    SET status = 'EXPIRED'
    WHERE status IN ('ACTIVE', 'PARTIALLY_SOLD')
      AND showtime <= ${asOf}
  `;
}
