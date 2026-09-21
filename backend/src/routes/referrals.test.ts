import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueOtp } from "../lib/otpStore";
import { issueSessionToken } from "../lib/session";
import { REFERRAL_MILESTONE_INTERVAL, REFERRAL_MILESTONE_POINTS } from "../lib/referral";

// End-to-end coverage for referral tracking and the points ledger, against
// the real local Postgres through the actual Express app - not mocked. See
// lib/referral.ts for the core logic this exercises: referredByUserId is
// only ever set at signup (POST /api/auth/otp/verify's new-account
// branch), a referral only "counts" once the referred user has completed
// a real listing or reservation, and REFERRAL_MILESTONE points are
// awarded exactly once per 20-referral threshold via
// referralMilestoneThreshold.
describe("referrals", () => {
  const LAT = 12.9716;
  const LNG = 77.5946;
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  const userIds: string[] = [];
  const listingIds: string[] = [];

  // POST /api/auth/otp/verify's PHONE_RE is digits-only, unlike every
  // other test helper's UUID-suffixed phone (fine everywhere else, since
  // nothing else calls the real OTP endpoint with it) - see
  // suspension.test.ts's sellerPhone for the same convention.
  function randomDigitPhone(): string {
    return `+1${Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)}`;
  }

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.pointsLedger.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.listingView.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listingContact.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    // referredByUserId is ON DELETE SET NULL, so deleting a referrer here
    // before its referred users are deleted is safe - no manual nulling
    // needed first.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(label: string, referralCode?: string, phone?: string) {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        phone: phone ?? `+1555ref${label}${suffix}`.slice(0, 30),
        name: `Referral Test ${label}`,
        ...(referralCode ? { referralCode } : {}),
      },
    });
    userIds.push(user.id);
    return { id: user.id, token: await issueSessionToken(user) };
  }

  // Signs up (or logs in, if the phone already has an account) through the
  // real OTP flow - the only path that's allowed to set referredByUserId.
  async function verifyOtp(phone: string, ref?: string) {
    const code = await issueOtp(phone);
    const res = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone, code, ...(ref ? { ref } : {}) });
    expect(res.status).toBe(200);
    userIds.push(res.body.data.user.id);
    return { id: res.body.data.user.id as string, token: res.body.data.token as string };
  }

  async function createListing(token: string, overrides: { theaterLat?: number; theaterLng?: number } = {}) {
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${token}`)
      .field("movieName", "Referral Test Movie")
      .field("theaterName", "Referral Test Theater")
      .field("bookingId", `REFTEST${randomUUID()}`.slice(0, 20))
      .field("totalSeats", "3")
      .field("pricePerSeat", "200")
      .field("showtime", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .field("theaterLat", String(overrides.theaterLat ?? LAT))
      .field("theaterLng", String(overrides.theaterLng ?? LNG))
      .attach("screenshot", onePixelPng, { filename: "test.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    listingIds.push(res.body.data.listing.id);
    return res.body.data.listing.id as string;
  }

  // Bypasses the HTTP listing-creation flow (just a direct Prisma row) -
  // used to cheaply give a referred user a "qualifying action" when the
  // test only cares about the resulting referral count, not re-proving
  // POST /api/listings works.
  async function createQualifyingListingDirect(sellerId: string) {
    const listing = await prisma.listing.create({
      data: {
        sellerId,
        movieName: "Referral Bulk Test Movie",
        theaterName: "Referral Bulk Test Theater",
        theaterLat: LAT,
        theaterLng: LNG,
        showtime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        bookingId: `REFBULK${randomUUID()}`.slice(0, 20),
        totalSeats: 1,
        availableSeats: 1,
        pricePerSeat: 200,
      },
    });
    listingIds.push(listing.id);
    return listing.id;
  }

  async function getReferrals(token: string) {
    const res = await request(app)
      .get("/api/users/me/referrals")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body.data as {
      referralCode: string;
      referredCount: number;
      pointsBalance: number;
      nextMilestoneAt: number;
      referralsUntilNextMilestone: number;
    };
  }

  it("a referral only counts after the referred user completes a real listing, not just signup", async () => {
    const referrer = await createUser("cnt-referrer", "REFCOUNTA");

    const phone = randomDigitPhone();
    const referred = await verifyOtp(phone, "REFCOUNTA");

    const linked = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    expect(linked.referredByUserId).toBe(referrer.id);

    // Signed up, but hasn't listed or reserved anything yet - shouldn't count.
    const beforeQualifying = await getReferrals(referrer.token);
    expect(beforeQualifying.referredCount).toBe(0);

    await createListing(referred.token);

    const afterQualifying = await getReferrals(referrer.token);
    expect(afterQualifying.referredCount).toBe(1);
  });

  it("a reservation also counts as a qualifying action, not just listing", async () => {
    const referrer = await createUser("cnt2-referrer", "REFCOUNTB");
    const otherSeller = await createUser("cnt2-otherseller");
    const listingId = await createListing(otherSeller.token);

    const phone = randomDigitPhone();
    const referred = await verifyOtp(phone, "REFCOUNTB");

    expect((await getReferrals(referrer.token)).referredCount).toBe(0);

    const reserveRes = await request(app)
      .post(`/api/listings/${listingId}/reserve`)
      .set("Authorization", `Bearer ${referred.token}`)
      .send({ seats: 1, deliveryMethod: "IN_PERSON" });
    expect(reserveRes.status).toBe(201);

    expect((await getReferrals(referrer.token)).referredCount).toBe(1);
  });

  it("signup with a missing/bogus ref code succeeds without linking anyone", async () => {
    const phone = randomDigitPhone();
    const referred = await verifyOtp(phone, "NOT-A-REAL-CODE");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: referred.id } });
    expect(user.referredByUserId).toBeNull();
  });

  it("awards +200 points exactly once when qualified referrals cross the 20 threshold, and never double-awards", async () => {
    expect(REFERRAL_MILESTONE_INTERVAL).toBe(20);
    expect(REFERRAL_MILESTONE_POINTS).toBe(200);

    const referrer = await createUser("milestone-referrer", "REFMILE20");

    // 19 referred users, each already qualified via a direct listing -
    // cheaper than going through real signup + real listing creation 19
    // times for setup that isn't itself under test.
    const bulkReferred: string[] = [];
    for (let i = 0; i < REFERRAL_MILESTONE_INTERVAL - 1; i++) {
      const user = await createUser(`milestone-bulk-${i}`);
      await prisma.user.update({ where: { id: user.id }, data: { referredByUserId: referrer.id } });
      await createQualifyingListingDirect(user.id);
      bulkReferred.push(user.id);
    }

    expect((await getReferrals(referrer.token)).referredCount).toBe(19);
    expect((await getReferrals(referrer.token)).pointsBalance).toBe(0);

    // The 20th referred user, signed up and qualified through the real
    // HTTP flow end to end - this is the one that should actually cross
    // the threshold.
    const phone20 = randomDigitPhone();
    const referred20 = await verifyOtp(phone20, "REFMILE20");
    await createListing(referred20.token);

    const afterMilestone = await getReferrals(referrer.token);
    expect(afterMilestone.referredCount).toBe(20);
    expect(afterMilestone.pointsBalance).toBe(REFERRAL_MILESTONE_POINTS);
    expect(afterMilestone.nextMilestoneAt).toBe(40);
    expect(afterMilestone.referralsUntilNextMilestone).toBe(20);

    const ledgerRows = await prisma.pointsLedger.findMany({ where: { userId: referrer.id } });
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].amount).toBe(200);
    expect(ledgerRows[0].reason).toBe("REFERRAL_MILESTONE");

    // An already-qualified referred user (bulkReferred[0], counted since
    // their first listing above) creating a SECOND listing must not move
    // the referredCount (it's a distinct-user count) or award anything
    // again.
    const alreadyQualified = await prisma.user.findUniqueOrThrow({ where: { id: bulkReferred[0] } });
    const secondListingToken = await issueSessionToken(alreadyQualified);
    await createListing(secondListingToken);

    const afterRepeat = await getReferrals(referrer.token);
    expect(afterRepeat.referredCount).toBe(20);
    expect(afterRepeat.pointsBalance).toBe(REFERRAL_MILESTONE_POINTS);
    expect(await prisma.pointsLedger.count({ where: { userId: referrer.id } })).toBe(1);
  });

  it("the displayed points balance always equals the sum of the user's ledger rows", async () => {
    const user = await createUser("ledger-sum");

    // Directly seeded rows (not milestone-driven) - proves the balance is
    // a live SUM over PointsLedger, not something that only happens to
    // match in the milestone-specific test above.
    await prisma.pointsLedger.createMany({
      data: [
        { userId: user.id, amount: 200, reason: "REFERRAL_MILESTONE" },
        { userId: user.id, amount: 200, reason: "REFERRAL_MILESTONE" },
      ],
    });

    const summary = await getReferrals(user.token);
    expect(summary.pointsBalance).toBe(400);

    const rows = await prisma.pointsLedger.findMany({ where: { userId: user.id } });
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(summary.pointsBalance);
  });

  it("a normal login (no ?ref=) for an existing user leaves referredByUserId untouched", async () => {
    const phone = randomDigitPhone();
    const existing = await createUser("existing-login", undefined, phone);

    const code = await issueOtp(phone);
    const res = await request(app).post("/api/auth/otp/verify").send({ phone, code });
    expect(res.status).toBe(200);

    const afterLogin = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(afterLogin.referredByUserId).toBeNull();
  });

  it("a ?ref= on a LOGIN (not signup) for an already-existing user is ignored, not retroactively applied", async () => {
    const referrer = await createUser("late-ref-referrer", "REFLATEAPPLY");
    const phone = randomDigitPhone();
    const existing = await createUser("late-ref-existing", undefined, phone);

    const code = await issueOtp(phone);
    const res = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone, code, ref: "REFLATEAPPLY" });
    expect(res.status).toBe(200);

    const afterLogin = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(afterLogin.referredByUserId).toBeNull();
    expect((await getReferrals(referrer.token)).referredCount).toBe(0);
  });
});
