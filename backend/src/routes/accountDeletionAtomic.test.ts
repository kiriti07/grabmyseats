import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { issueOtp } from "../lib/otpStore";
import { deleteOtpIdentifier } from "../lib/accountDeletion";

// Account deletion is one database transaction: if any step fails partway
// (here: giving a held seat back), nothing at all has changed - the
// account, its listings and its holds are exactly as before. Its own file
// because it replaces lib/listingSeats for every test in it.
vi.mock("../lib/listingSeats", () => ({
  releaseListingSeats: vi.fn().mockRejectedValue(new Error("simulated failure")),
  consumeListingSeats: vi.fn(),
}));

describe("account deletion is all-or-nothing", () => {
  const ids: { users: string[]; listing?: string; txn?: string } = { users: [] };

  afterAll(async () => {
    if (ids.txn) await prisma.transaction.deleteMany({ where: { id: ids.txn } });
    if (ids.listing) await prisma.listing.deleteMany({ where: { id: ids.listing } });
    await prisma.pointsLedger.deleteMany({ where: { userId: { in: ids.users } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  });

  it("a failure partway leaves the account untouched", async () => {
    const email = `atomic-${randomUUID()}@example.com`;
    const me = await prisma.user.create({ data: { email, emailVerifiedAt: new Date(), name: "Still Here" } });
    const seller = await prisma.user.create({ data: { email: `atomic-s-${randomUUID()}@example.com` } });
    ids.users.push(me.id, seller.id);
    const listing = await prisma.listing.create({
      data: {
        sellerId: seller.id, movieName: "Atomic", theaterName: "Atomic", theaterLat: 17.4, theaterLng: 78.4,
        showtime: new Date(Date.now() + 86_400_000), bookingId: `AT${randomUUID()}`.slice(0, 20),
        totalSeats: 2, availableSeats: 2, reservedSeats: 1, pricePerSeat: 100,
      },
    });
    ids.listing = listing.id;
    const txn = await prisma.transaction.create({
      data: { listingId: listing.id, buyerId: me.id, seatsCount: 1, amountPaid: 100, status: "RESERVED",
        reservationExpiresAt: new Date(Date.now() + 600_000) },
    });
    ids.txn = txn.id;
    await prisma.pointsLedger.create({ data: { userId: me.id, amount: 200, reason: "REFERRAL_MILESTONE" } });

    const token = await issueSessionToken(me);
    const res = await request(app)
      .delete("/api/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: "DELETE", code: await issueOtp(deleteOtpIdentifier(me.id)) });
    expect(res.status).toBe(500);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(after).toMatchObject({ email, name: "Still Here", deletedAt: null, referralCode: me.referralCode });
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: txn.id } })).status).toBe("RESERVED");
    expect(await prisma.pointsLedger.count({ where: { userId: me.id } })).toBe(1);
    // Still signed in.
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(200);
  });
});
