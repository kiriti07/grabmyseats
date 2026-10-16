import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { User } from "../generated/prisma/client";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { issueAdminSessionToken } from "../lib/adminSession";
import { issueOtp } from "../lib/otpStore";
import { claimOtpIdentifier, loginOtpIdentifier } from "../lib/identity";
import { deleteOtpIdentifier } from "../lib/accountDeletion";
import { identifierHash, IdentifierHashConfigError } from "../lib/identifierHash";
import { storageProvider } from "../lib/storage";
import { parseCloudinaryUrl } from "../lib/storage/CloudinaryStorageProvider";
import { purgeDeletedAccountRecords } from "../jobs/purgeDeletedAccountRecords";

// Account deletion end to end (lib/accountDeletion.ts): DELETE
// /api/users/me with its confirmation, POST /api/admin/users/:id/delete,
// what's deleted vs kept, the suspended-account identifier hashes and the
// 3-year purge - against the real throwaway Postgres/Redis, nothing mocked
// but the storage provider (Cloudinary is never contacted).
describe("account deletion", () => {
  const TAG = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const adminIds: string[] = [];
  const venueIds: string[] = [];

  const email = () => `del-${TAG}-${randomUUID().slice(0, 8)}@example.com`;
  const phone = () => `+919${String(randomInt(10 ** 8, 10 ** 9))}`;

  async function makeUser(data: Partial<User> = {}): Promise<{ user: User; token: string }> {
    const user = await prisma.user.create({
      data: { email: email(), emailVerifiedAt: new Date(), ...data } as never,
    });
    userIds.push(user.id);
    return { user, token: await issueSessionToken(user) };
  }

  async function makeAdmin(role: "ADMIN" | "SUPPORT") {
    const admin = await prisma.adminUser.create({
      data: { username: `del-${role}-${TAG}-${randomUUID().slice(0, 6)}`, passwordHash: "n/a", role },
    });
    adminIds.push(admin.id);
    return issueAdminSessionToken(admin);
  }

  function makeListing(sellerId: string, data: Record<string, unknown> = {}) {
    return prisma.listing.create({
      data: {
        sellerId,
        movieName: `Deletion Test ${TAG}`,
        theaterName: "Deletion Test Theater",
        theaterLat: 17.44,
        theaterLng: 78.35,
        showtime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        bookingId: `DEL${randomUUID()}`.slice(0, 20),
        totalSeats: 4,
        availableSeats: 4,
        pricePerSeat: 200,
        ...data,
      },
    });
  }

  function deleteMe(token: string, body: Record<string, unknown>) {
    return request(app).delete("/api/users/me").set("Authorization", `Bearer ${token}`).send(body);
  }

  function signup(channel: "email" | "phone", identifier: string, code: string, ref?: string) {
    return request(app)
      .post("/api/auth/otp/verify")
      .send({ channel, identifier, code, intent: "signup", ...(ref ? { ref } : {}) });
  }

  async function trackSignup(res: request.Response) {
    if (res.body?.data?.user?.id) userIds.push(res.body.data.user.id);
    return res;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const listings = await prisma.listing.findMany({ where: { sellerId: { in: userIds } }, select: { id: true } });
    const listingIds = listings.map((l) => l.id);
    const txns = await prisma.transaction.findMany({
      where: { OR: [{ buyerId: { in: userIds } }, { listingId: { in: listingIds } }] },
      select: { id: true },
    });
    const txnIds = txns.map((t) => t.id);
    await prisma.rating.deleteMany({ where: { transactionId: { in: txnIds } } });
    await prisma.fraudReport.deleteMany({
      where: { OR: [{ reporterId: { in: userIds } }, { reportedUserId: { in: userIds } }] },
    });
    await prisma.transaction.deleteMany({ where: { id: { in: txnIds } } });
    await prisma.alertNotification.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.alertNotification.deleteMany({ where: { alert: { userId: { in: userIds } } } });
    await prisma.ticketAlert.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.listingView.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { listingId: { in: listingIds } }] } });
    await prisma.listingContact.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { listingId: { in: listingIds } }] } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    await prisma.pointsLedger.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.deletedIdentifier.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { referredByUserId: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  });

  describe("confirmation", () => {
    it("needs a session", async () => {
      expect((await request(app).delete("/api/users/me").send({ confirm: "DELETE" })).status).toBe(401);
      expect((await request(app).post("/api/users/me/delete/send-code")).status).toBe(401);
    });

    it("sends the code to the verified email, masked", async () => {
      const { user, token } = await makeUser({ phone: phone(), phoneVerifiedAt: new Date() });
      const res = await request(app).post("/api/users/me/delete/send-code").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.channel).toBe("email");
      expect(res.body.data.destination).toMatch(/^d•••@example\.com$/);
      expect(res.body.data.destination).not.toContain(user.email!.split("@")[0]);
    });

    it("uses a verified phone when there's no verified email and SMS can reach it", async () => {
      const { token } = await makeUser({ email: null, emailVerifiedAt: null, phone: phone(), phoneVerifiedAt: new Date() });
      const res = await request(app).post("/api/users/me/delete/send-code").set("Authorization", `Bearer ${token}`);
      expect(res.body.data.channel).toBe("phone");
    });

    it("has no channel for a phone-only account while SMS is off, or for unverified identifiers", async () => {
      const phoneOnly = await makeUser({ email: null, emailVerifiedAt: null, phone: phone(), phoneVerifiedAt: new Date() });
      const unverified = await makeUser({ emailVerifiedAt: null, phone: phone() });
      vi.stubEnv("NODE_ENV", "production"); // console SMS provider -> SMS off
      for (const { token } of [phoneOnly, unverified]) {
        const res = await request(app).post("/api/users/me/delete/send-code").set("Authorization", `Bearer ${token}`);
        expect(res.body.data).toEqual({ channel: null, destination: null });
      }
    });

    it("refuses without typing DELETE exactly", async () => {
      const { token } = await makeUser();
      for (const confirm of [undefined, "", "delete", "DELETE ME"]) {
        expect((await deleteMe(token, { confirm })).status).toBe(400);
      }
    });

    it("refuses a missing, wrong, other-flow, expired or reused code", async () => {
      const { user, token } = await makeUser();
      expect((await deleteMe(token, { confirm: "DELETE" })).status).toBe(401);

      await issueOtp(deleteOtpIdentifier(user.id));
      expect((await deleteMe(token, { confirm: "DELETE", code: "000000" })).status).toBe(401);

      const loginCode = await issueOtp(loginOtpIdentifier("email", user.email!));
      expect((await deleteMe(token, { confirm: "DELETE", code: loginCode })).status).toBe(401);

      const claimCode = await issueOtp(claimOtpIdentifier(user.id, "email", user.email!));
      expect((await deleteMe(token, { confirm: "DELETE", code: claimCode })).status).toBe(401);

      const code = await issueOtp(deleteOtpIdentifier(user.id));
      const { redis } = await import("../lib/redis");
      await redis.pexpire(`otp:${deleteOtpIdentifier(user.id)}`, 1);
      await new Promise((r) => setTimeout(r, 20));
      expect((await deleteMe(token, { confirm: "DELETE", code })).status).toBe(401);

      const fresh = await issueOtp(deleteOtpIdentifier(user.id));
      expect((await deleteMe(token, { confirm: "DELETE", code: "111111" })).status).toBe(401);
      // The wrong attempt consumed it.
      expect((await deleteMe(token, { confirm: "DELETE", code: fresh })).status).toBe(401);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletedAt).toBeNull();
    });

    it("accepts typing DELETE alone when there's no channel", async () => {
      const { user, token } = await makeUser({ email: null, emailVerifiedAt: null, phone: phone(), phoneVerifiedAt: new Date() });
      vi.stubEnv("NODE_ENV", "production");
      const res = await deleteMe(token, { confirm: "DELETE" });
      expect(res.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletedAt).not.toBeNull();
    });
  });

  describe("what a deletion removes and keeps", () => {
    let me: User;
    let token: string;
    let other: User;
    let otherBuyer: User;
    const ids: Record<string, string> = {};
    let photoDelete: ReturnType<typeof vi.fn>;
    let deleteRes: request.Response;

    beforeAll(async () => {
      const referrer = await makeUser();
      ({ user: me, token } = await makeUser({
        phone: phone(),
        phoneVerifiedAt: new Date(),
        hasWhatsapp: true,
        name: "Delete Me",
        fullName: "Delete Me Fully",
        dateOfBirth: new Date("1990-01-01"),
        gender: "other",
        address: "1 Test Street",
        profileImageUrl: "https://res.cloudinary.com/demo/image/upload/v1/grabmyseats/profiles/x.jpg",
        lastLoginAt: new Date(),
        referredByUserId: referrer.user.id,
      }));
      ({ user: other } = await makeUser());
      ({ user: otherBuyer } = await makeUser());

      // My listings: live, partly sold, sold.
      const live = await makeListing(me.id);
      const partly = await makeListing(me.id, { status: "PARTIALLY_SOLD", availableSeats: 2 });
      const sold = await makeListing(me.id, { status: "SOLD", availableSeats: 0, ticketFingerprint: `fp-${TAG}` });
      // Someone else holding seats on my live listing.
      await prisma.listing.update({ where: { id: live.id }, data: { reservedSeats: 1 } });
      const holdOnMine = await prisma.transaction.create({
        data: { listingId: live.id, buyerId: otherBuyer.id, seatsCount: 1, amountPaid: 200, status: "RESERVED",
          reservationExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });
      // Me holding seats on someone else's listing.
      const theirs = await makeListing(other.id, { reservedSeats: 2 });
      const myHold = await prisma.transaction.create({
        data: { listingId: theirs.id, buyerId: me.id, seatsCount: 2, amountPaid: 400, status: "RESERVED",
          reservationExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });
      // Ratings: one I gave (on their listing), one I received (on my sold one).
      const bought = await prisma.transaction.create({
        data: { listingId: theirs.id, buyerId: me.id, seatsCount: 1, amountPaid: 200, status: "BUYER_CONFIRMED" },
      });
      const given = await prisma.rating.create({
        data: { raterId: me.id, ratedUserId: other.id, transactionId: bought.id, stars: 2, comment: "my words" },
      });
      const soldTxn = await prisma.transaction.create({
        data: { listingId: sold.id, buyerId: otherBuyer.id, seatsCount: 1, amountPaid: 200, status: "BUYER_CONFIRMED" },
      });
      const received = await prisma.rating.create({
        data: { raterId: otherBuyer.id, ratedUserId: me.id, transactionId: soldTxn.id, stars: 5, comment: "great" },
      });
      // Views, contacts, alerts, pin votes, points, reports.
      await prisma.listingView.create({ data: { listingId: theirs.id, userId: me.id } });
      await prisma.listingContact.create({ data: { listingId: theirs.id, userId: me.id } });
      const alert = await prisma.ticketAlert.create({
        data: { userId: me.id, titleQuery: "Test", lat: 17.4, lng: 78.4, expiresAt: new Date(Date.now() + 86_400_000) },
      });
      await prisma.alertNotification.create({ data: { alertId: alert.id, listingId: theirs.id } });
      const venue = await prisma.venue.create({
        data: { normalizedName: `del venue ${TAG}`, displayName: "Del Venue", cityId: "hyderabad", lat: 17.44, lng: 78.35, source: "SELLER_CONFIRMED" },
      });
      venueIds.push(venue.id);
      await prisma.venuePinVote.create({ data: { venueId: venue.id, userId: me.id, lat: 17.44, lng: 78.35 } });
      await prisma.pointsLedger.create({ data: { userId: me.id, amount: 200, reason: "REFERRAL_MILESTONE" } });
      await prisma.pushToken.create({ data: { userId: me.id, token: `fake-token-${randomUUID()}`, platform: "android" } });
      await prisma.pushToken.create({ data: { userId: me.id, token: `fake-token-${randomUUID()}`, platform: "android" } });
      const delivery = await prisma.pushDelivery.create({ data: { userId: me.id, status: "SENT", matchCount: 1 } });
      await prisma.alertNotification.update({
        where: { alertId_listingId: { alertId: alert.id, listingId: theirs.id } },
        data: { deliveryId: delivery.id },
      });
      const filed = await prisma.fraudReport.create({
        data: { reporterId: me.id, reportedUserId: other.id, description: "filed by me", evidenceUrls: [] },
      });
      const against = await prisma.fraudReport.create({
        data: { reporterId: other.id, reportedUserId: me.id, description: "against me", evidenceUrls: [] },
      });
      Object.assign(ids, {
        live: live.id, partly: partly.id, sold: sold.id, theirs: theirs.id, holdOnMine: holdOnMine.id,
        myHold: myHold.id, given: given.id, received: received.id, filed: filed.id, against: against.id,
        alert: alert.id, venue: venue.id, referrer: referrer.user.id,
      });

      photoDelete = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(storageProvider, "delete").mockImplementation(photoDelete);
      const code = await issueOtp(deleteOtpIdentifier(me.id));
      deleteRes = await deleteMe(token, { confirm: "DELETE", code });
    });

    it("succeeds and clears the session cookie", () => {
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data).toEqual({ deleted: true });
      expect(String(deleteRes.headers["set-cookie"])).toMatch(/authjs\.session-token=;/);
    });

    it("keeps an anonymous record with every personal field cleared", async () => {
      const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row).toMatchObject({
        email: null, emailVerifiedAt: null, phone: null, phoneVerifiedAt: null, hasWhatsapp: false,
        name: null, fullName: null, dateOfBirth: null, gender: null, address: null,
        profileImageUrl: null, lastLoginAt: null, referredByUserId: null, razorpayAccountId: null,
      });
      expect(row.referralCode).not.toBe(me.referralCode);
    });

    it("deletes the profile photo from storage", () => {
      expect(photoDelete).toHaveBeenCalledWith(me.profileImageUrl);
    });

    it("withdraws live listings and leaves past ones", async () => {
      const listings = await prisma.listing.findMany({ where: { sellerId: me.id } });
      const byId = Object.fromEntries(listings.map((l) => [l.id, l]));
      expect(byId[ids.live].status).toBe("WITHDRAWN");
      expect(byId[ids.partly].status).toBe("WITHDRAWN");
      expect(byId[ids.sold].status).toBe("SOLD");
      expect(byId[ids.sold].ticketFingerprint).toBe(`fp-${TAG}`);
      const search = await request(app).get("/api/listings/search").query({ lat: 17.44, lng: 78.35, radiusKm: 5, q: `Deletion Test ${TAG}` });
      const found = (search.body.data?.listings ?? []).map((l: { id: string }) => l.id);
      expect(found).not.toContain(ids.live);
      expect(found).not.toContain(ids.partly);
    });

    it("ends open reservations on both sides and gives the seats back", async () => {
      const holds = await prisma.transaction.findMany({ where: { id: { in: [ids.holdOnMine, ids.myHold] } } });
      expect(holds.map((t) => t.status)).toEqual(["EXPIRED", "EXPIRED"]);
      const theirs = await prisma.listing.findUniqueOrThrow({ where: { id: ids.theirs } });
      expect(theirs.reservedSeats).toBe(0);
      const live = await prisma.listing.findUniqueOrThrow({ where: { id: ids.live } });
      expect(live.reservedSeats).toBe(0);
    });

    it("deletes alerts, notifications, views, contacts, pin votes and points", async () => {
      expect(await prisma.ticketAlert.count({ where: { userId: me.id } })).toBe(0);
      expect(await prisma.alertNotification.count({ where: { alertId: ids.alert } })).toBe(0);
      expect(await prisma.listingView.count({ where: { userId: me.id } })).toBe(0);
      expect(await prisma.listingContact.count({ where: { userId: me.id } })).toBe(0);
      expect(await prisma.venuePinVote.count({ where: { userId: me.id } })).toBe(0);
      expect(await prisma.venue.count({ where: { id: ids.venue } })).toBe(1);
      expect(await prisma.pointsLedger.count({ where: { userId: me.id } })).toBe(0);
    });

    it("keeps the stars of ratings given but not their words; hides ratings received", async () => {
      const given = await prisma.rating.findUniqueOrThrow({ where: { id: ids.given } });
      expect(given).toMatchObject({ stars: 2, comment: null });
      const theirSummary = await request(app).get(`/api/users/${other.id}/rating-summary`);
      expect(theirSummary.body.data).toMatchObject({ totalRatings: 1, averageStars: 2 });

      expect(await prisma.rating.count({ where: { id: ids.received } })).toBe(1);
      const mySummary = await request(app).get(`/api/users/${me.id}/rating-summary`);
      expect(mySummary.body.data).toEqual({ averageStars: null, totalRatings: 0, recentComments: [] });
    });

    it("keeps reports filed by and against the account", async () => {
      expect(await prisma.fraudReport.count({ where: { id: { in: [ids.filed, ids.against] } } })).toBe(2);
    });

    it("deletes push devices and push history", async () => {
      expect(await prisma.pushToken.count({ where: { userId: me.id } })).toBe(0);
      expect(await prisma.pushDelivery.count({ where: { userId: me.id } })).toBe(0);
    });

    it("keeps nothing from the identifiers of an account that wasn't suspended", async () => {
      expect(await prisma.deletedIdentifier.count({ where: { userId: me.id } })).toBe(0);
    });

    it("ends the old session, and a second delete is refused", async () => {
      expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
      expect((await deleteMe(token, { confirm: "DELETE" })).status).toBe(401);
    });

    it("the same email and phone can sign up again, as a new account", async () => {
      const byEmail = await trackSignup(await signup("email", me.email!, await issueOtp(loginOtpIdentifier("email", me.email!))));
      expect(byEmail.status).toBe(200);
      expect(byEmail.body.data.user.id).not.toBe(me.id);
      expect(byEmail.body.data.isNewAccount).toBe(true);

      const byPhone = await trackSignup(await signup("phone", me.phone!, await issueOtp(loginOtpIdentifier("phone", me.phone!))));
      expect(byPhone.status).toBe(200);
      expect(byPhone.body.data.user.id).not.toBe(me.id);
    });

    it("the old referral link no longer credits anyone", async () => {
      const newEmail = email();
      const res = await trackSignup(await signup("email", newEmail, await issueOtp(loginOtpIdentifier("email", newEmail)), me.referralCode));
      expect(res.status).toBe(200);
      const created = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.user.id } });
      expect(created.referredByUserId).toBeNull();
    });

    it("a profile-photo storage failure doesn't stop a deletion", async () => {
      vi.spyOn(storageProvider, "delete").mockRejectedValue(new Error("storage down"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { user, token: t } = await makeUser({
        profileImageUrl: "https://res.cloudinary.com/demo/image/upload/v1/grabmyseats/profiles/y.jpg",
      });
      const res = await deleteMe(t, { confirm: "DELETE", code: await issueOtp(deleteOtpIdentifier(user.id)) });
      expect(res.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).profileImageUrl).toBeNull();
    });
  });

  describe("suspended accounts", () => {
    let suspended: User;
    let suspendedToken: string;
    let adminToken: string;
    let supportToken: string;
    const REASON = "Sold the same ticket twice";

    beforeAll(async () => {
      ({ user: suspended, token: suspendedToken } = await makeUser({
        phone: phone(),
        phoneVerifiedAt: new Date(),
        suspendedAt: new Date(),
        suspensionReason: REASON,
      }));
      adminToken = await makeAdmin("ADMIN");
      supportToken = await makeAdmin("SUPPORT");
    });

    it("can't delete themselves - they can't sign in", async () => {
      const res = await deleteMe(suspendedToken, { confirm: "DELETE" });
      expect(res.status).toBe(403);
    });

    it("only an ADMIN can delete an account for them", async () => {
      const url = `/api/admin/users/${suspended.id}/delete`;
      expect((await request(app).post(url)).status).toBe(401);
      expect((await request(app).post(url).set("Authorization", `Bearer ${suspendedToken}`)).status).toBe(401);
      expect((await request(app).post(url).set("Authorization", `Bearer ${supportToken}`)).status).toBe(403);

      const admins = await prisma.adminUser.count();
      const res = await request(app).post(url).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ id: suspended.id, email: null, phone: null, suspensionReason: REASON });
      expect(res.body.data.user.deletedAt).not.toBeNull();
      expect(await prisma.adminUser.count()).toBe(admins);
    });

    it("keeps the suspension and a keyed hash of each verified identifier - never the identifier", async () => {
      const row = await prisma.user.findUniqueOrThrow({ where: { id: suspended.id } });
      expect(row.suspendedAt).not.toBeNull();
      expect(row.suspensionReason).toBe(REASON);
      const hashes = await prisma.deletedIdentifier.findMany({ where: { userId: suspended.id } });
      expect(hashes.map((h) => h.hash).sort()).toEqual(
        [identifierHash("email", suspended.email!), identifierHash("phone", suspended.phone!)].sort(),
      );
      for (const { hash } of hashes) {
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(hash).not.toContain(suspended.email!);
        expect(hash).not.toContain(suspended.phone!.slice(1));
      }
    });

    it("refuses a new sign-up with either identifier, with the suspension message", async () => {
      const upper = suspended.email!.toUpperCase();
      const byEmail = await trackSignup(await signup("email", upper, await issueOtp(loginOtpIdentifier("email", suspended.email!))));
      expect(byEmail.status).toBe(403);
      expect(byEmail.body.error).toBe(`Your account has been suspended: ${REASON}`);

      const byPhone = await trackSignup(await signup("phone", suspended.phone!, await issueOtp(loginOtpIdentifier("phone", suspended.phone!))));
      expect(byPhone.status).toBe(403);
      expect(byPhone.body.error).toBe(`Your account has been suspended: ${REASON}`);
    });

    it("refuses the sign-in -> create-account path too", async () => {
      const signin = await request(app)
        .post("/api/auth/otp/verify")
        .send({ channel: "email", identifier: suspended.email, code: await issueOtp(loginOtpIdentifier("email", suspended.email!)), intent: "signin" });
      expect(signin.body.data.noAccount).toBe(true);
      const confirm = await trackSignup(
        await request(app).post("/api/auth/signup/confirm").send({ signupToken: signin.body.data.signupToken }),
      );
      expect(confirm.status).toBe(403);
    });

    it("refuses moving either identifier onto another account", async () => {
      const { user, token } = await makeUser();
      for (const [channel, value] of [["email", suspended.email!], ["phone", suspended.phone!]] as const) {
        const code = await issueOtp(claimOtpIdentifier(user.id, channel, value));
        const res = await request(app)
          .post("/api/users/me/identifiers/claim/verify")
          .set("Authorization", `Bearer ${token}`)
          .send({ channel, identifier: value, code });
        expect(res.status).toBe(403);
        expect(res.body.error).toContain(REASON);
      }
    });

    it("never hashes an unverified identifier", async () => {
      const unverifiedPhone = phone();
      const { user } = await makeUser({ phone: unverifiedPhone, suspendedAt: new Date(), suspensionReason: "x" });
      const res = await request(app).post(`/api/admin/users/${user.id}/delete`).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const hashes = await prisma.deletedIdentifier.findMany({ where: { userId: user.id } });
      expect(hashes.map((h) => h.hash)).toEqual([identifierHash("email", user.email!)]);
    });

    it("refuses deleting twice, and suspending/unsuspending a deleted account", async () => {
      const auth = { Authorization: `Bearer ${adminToken}` };
      expect((await request(app).post(`/api/admin/users/${suspended.id}/delete`).set(auth)).status).toBe(409);
      expect((await request(app).post(`/api/admin/users/${suspended.id}/unsuspend`).set(auth)).status).toBe(409);
      expect((await request(app).post(`/api/admin/users/${suspended.id}/suspend`).set(auth).send({ reason: "r" })).status).toBe(409);
      expect((await request(app).post(`/api/admin/users/no-such-user/delete`).set(auth)).status).toBe(404);
    });

    it("refuses resolving a report with suspension against a deleted account", async () => {
      const { user: reporter } = await makeUser();
      const report = await prisma.fraudReport.create({
        data: { reporterId: reporter.id, reportedUserId: suspended.id, description: "d", evidenceUrls: [] },
      });
      const res = await request(app)
        .post(`/api/admin/fraud-reports/${report.id}/resolve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ action: "ACTIONED", suspend: true, suspensionReason: "again" });
      expect(res.status).toBe(409);
      expect((await prisma.fraudReport.findUniqueOrThrow({ where: { id: report.id } })).status).toBe("PENDING");
    });

    it("an admin token can't use the customer endpoint", async () => {
      expect((await deleteMe(adminToken, { confirm: "DELETE" })).status).toBe(401);
    });
  });

  describe("Play reviewer account", () => {
    it("can be deleted, and the next reviewer login creates a fresh account", async () => {
      const REVIEW_EMAIL = `reviewer-${randomUUID()}@review-login.test.example`;
      vi.stubEnv("REVIEW_EMAIL", REVIEW_EMAIL);
      vi.stubEnv("REVIEW_OTP", "482915");
      const login = () =>
        request(app).post("/api/auth/otp/verify").send({ channel: "email", identifier: REVIEW_EMAIL, code: "482915", intent: "signin" });

      const first = await trackSignup(await login());
      expect(first.status).toBe(200);
      const firstId = first.body.data.user.id;
      const del = await deleteMe(first.body.data.token, {
        confirm: "DELETE",
        code: await issueOtp(deleteOtpIdentifier(firstId)),
      });
      expect(del.status).toBe(200);

      const second = await trackSignup(await login());
      expect(second.status).toBe(200);
      expect(second.body.data.user.id).not.toBe(firstId);
      expect(second.body.data.isNewAccount).toBe(true);
      const old = await prisma.user.findUniqueOrThrow({ where: { id: firstId } });
      expect(old).toMatchObject({ isReviewAccount: false, email: null });
      expect(old.deletedAt).not.toBeNull();
    });
  });

  describe("3-year retention", () => {
    it("purges hashes, suspension and reports against a deleted account after 3 years only", async () => {
      const now = new Date();
      const longAgo = new Date(now);
      longAgo.setUTCFullYear(longAgo.getUTCFullYear() - 3);
      longAgo.setUTCDate(longAgo.getUTCDate() - 1);
      const recent = new Date(now);
      recent.setUTCFullYear(recent.getUTCFullYear() - 2);

      const { user: other } = await makeUser();
      const make = async (deletedAt: Date) => {
        const { user } = await makeUser({ email: null, emailVerifiedAt: null, deletedAt, suspendedAt: deletedAt, suspensionReason: "old" });
        await prisma.deletedIdentifier.create({ data: { userId: user.id, hash: identifierHash("email", `${user.id}@example.com`) } });
        const against = await prisma.fraudReport.create({
          data: { reporterId: other.id, reportedUserId: user.id, description: "a",
            evidenceUrls: ["https://res.cloudinary.com/demo/image/upload/v1/grabmyseats/fraud-evidence/e.jpg"] },
        });
        const filed = await prisma.fraudReport.create({
          data: { reporterId: user.id, reportedUserId: other.id, description: "b", evidenceUrls: [] },
        });
        return { user, against, filed };
      };
      const expired = await make(longAgo);
      const kept = await make(recent);
      const evidenceDelete = vi.spyOn(storageProvider, "delete").mockResolvedValue(undefined);

      const result = await purgeDeletedAccountRecords(now);
      expect(result.identifierHashes).toBeGreaterThanOrEqual(1);

      expect(await prisma.deletedIdentifier.count({ where: { userId: expired.user.id } })).toBe(0);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: expired.user.id } })).toMatchObject({ suspendedAt: null, suspensionReason: null });
      expect(await prisma.fraudReport.count({ where: { id: expired.against.id } })).toBe(0);
      expect(await prisma.fraudReport.count({ where: { id: expired.filed.id } })).toBe(1);
      expect(evidenceDelete).toHaveBeenCalledWith(
        "https://res.cloudinary.com/demo/image/upload/v1/grabmyseats/fraud-evidence/e.jpg",
      );

      expect(await prisma.deletedIdentifier.count({ where: { userId: kept.user.id } })).toBe(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: kept.user.id } })).suspensionReason).toBe("old");
      expect(await prisma.fraudReport.count({ where: { id: kept.against.id } })).toBe(1);
    });
  });

  describe("identifier hash secret", () => {
    it("has no fallback: hashing without IDENTIFIER_HASH_SECRET throws", () => {
      vi.stubEnv("IDENTIFIER_HASH_SECRET", "");
      expect(() => identifierHash("email", "a@example.com")).toThrow(IdentifierHashConfigError);
      vi.stubEnv("IDENTIFIER_HASH_SECRET", "too-short");
      expect(() => identifierHash("email", "a@example.com")).toThrow(IdentifierHashConfigError);
    });

    it("hashes emails case-insensitively and keeps channels apart", () => {
      expect(identifierHash("email", "A@Example.com")).toBe(identifierHash("email", "a@example.com"));
      expect(identifierHash("email", "+919000000000")).not.toBe(identifierHash("phone", "+919000000000"));
    });

    it("the server refuses to boot in production without it", () => {
      const run = spawnSync(
        process.execPath,
        ["-r", "ts-node/register/transpile-only", "-e", "require('./src/index')"],
        {
          cwd: path.resolve(__dirname, "../.."),
          env: { ...process.env, NODE_ENV: "production", DEV_OTP_BYPASS_CODE: "", IDENTIFIER_HASH_SECRET: "", PORT: "0" },
          encoding: "utf8",
          timeout: 60_000,
        },
      );
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain("IDENTIFIER_HASH_SECRET must be set (32+ characters) when NODE_ENV=production");
      // The secret itself is never printed (there isn't one here, but the
      // message never interpolates the value either).
      expect(run.stderr).not.toMatch(/IDENTIFIER_HASH_SECRET=\S/);
    });
  });

  describe("storage urls", () => {
    it("parses our own Cloudinary urls into public ids", () => {
      expect(parseCloudinaryUrl("https://res.cloudinary.com/c/image/upload/v17/grabmyseats/profiles/u-1.jpg"))
        .toEqual({ publicId: "grabmyseats/profiles/u-1", resourceType: "image" });
      expect(parseCloudinaryUrl("https://res.cloudinary.com/c/raw/upload/grabmyseats/email-forwards/f.eml"))
        .toEqual({ publicId: "grabmyseats/email-forwards/f.eml", resourceType: "raw" });
    });

    it("refuses anything else", () => {
      for (const url of [
        "https://res.cloudinary.com/c/image/upload/v1/other/x.jpg",
        "https://evil.example/grabmyseats/profiles/x.jpg",
        "http://res.cloudinary.com/c/image/upload/grabmyseats/profiles/x.jpg",
      ]) {
        expect(() => parseCloudinaryUrl(url)).toThrow();
      }
    });
  });
});
