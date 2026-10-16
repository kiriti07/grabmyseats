import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Category } from "@grabmyseats/shared";
import { prisma } from "./prisma";
import { findAlertMatches } from "./alertMatching";

// lib/alertMatching.ts against the real throwaway Postgres: every condition
// of the matching rule, one at a time. Each test only looks at its own
// alerts (alertIds), so parallel test files can't interfere.
describe("alert matching", () => {
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const alertIds: string[] = [];
  let seller: string;
  let buyer: string;

  const HYD = { lat: 17.44, lng: 78.35, cityId: "hyderabad" };
  const MUMBAI = { lat: 19.076, lng: 72.8777, cityId: "mumbai" };

  // Calendar days a few days ahead, as stored: alert dates are UTC-midnight
  // DATEs; showtimes are India wall-clock in UTC fields.
  function day(offset: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  const D1 = day(3), D2 = day(4), D3 = day(5);
  const at = (date: string, time = "19:30") => new Date(`${date}T${time}:00.000Z`);

  async function user(data: Record<string, unknown> = {}) {
    const u = await prisma.user.create({ data: { email: `am-${randomUUID()}@example.com`, emailVerifiedAt: new Date(), ...data } });
    userIds.push(u.id);
    return u.id;
  }

  async function listing(data: {
    name?: string; category?: Category; date?: string; time?: string; seats?: number; reserved?: number;
    status?: "ACTIVE" | "PARTIALLY_SOLD" | "SOLD" | "WITHDRAWN"; sellerId?: string; place?: typeof HYD;
  } = {}) {
    const place = data.place ?? HYD;
    const l = await prisma.listing.create({
      data: {
        sellerId: data.sellerId ?? seller,
        category: data.category ?? "MOVIE",
        movieName: data.name ?? "Jailer (U/A)",
        theaterName: "Test Theater",
        theaterLat: place.lat,
        theaterLng: place.lng,
        cityId: place.cityId,
        showtime: at(data.date ?? D1, data.time),
        bookingId: `AM${randomUUID()}`.slice(0, 20),
        totalSeats: data.seats ?? 4,
        availableSeats: data.seats ?? 4,
        reservedSeats: data.reserved ?? 0,
        pricePerSeat: 200,
        status: data.status ?? "ACTIVE",
      },
    });
    listingIds.push(l.id);
    return l.id;
  }

  async function alert(data: {
    name?: string; category?: Category; dates?: string[]; seats?: number; userId?: string;
    point?: { lat: number; lng: number; radiusKm: number } | null; cityId?: string | null;
    isActive?: boolean; expiresAt?: Date;
  } = {}) {
    const point = data.point === undefined ? { ...HYD, radiusKm: 7 } : data.point;
    const a = await prisma.ticketAlert.create({
      data: {
        userId: data.userId ?? buyer,
        titleQuery: data.name ?? "Jailer",
        category: data.category ?? "MOVIE",
        seatsWanted: data.seats ?? 1,
        dates: (data.dates ?? [D1]).map((d) => new Date(`${d}T00:00:00.000Z`)),
        lat: point?.lat ?? null,
        lng: point?.lng ?? null,
        radiusKm: point?.radiusKm ?? 7,
        cityId: data.cityId ?? null,
        isActive: data.isActive ?? true,
        expiresAt: data.expiresAt ?? new Date(Date.now() + 10 * 86_400_000),
      },
    });
    alertIds.push(a.id);
    return a.id;
  }

  async function matched(alertId: string, listingId: string) {
    const matches = await findAlertMatches({ alertIds: [alertId] });
    return matches.some((m) => m.listingId === listingId);
  }

  beforeAll(async () => {
    seller = await user();
    buyer = await user();
  });

  afterAll(async () => {
    await prisma.alertNotification.deleteMany({ where: { alertId: { in: alertIds } } });
    await prisma.ticketAlert.deleteMany({ where: { id: { in: alertIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("seats", () => {
    it("wants 2, seller lists 4 -> match", async () => {
      expect(await matched(await alert({ seats: 2 }), await listing({ seats: 4 }))).toBe(true);
    });
    it("wants 3, seller lists 2 -> no match", async () => {
      expect(await matched(await alert({ seats: 3 }), await listing({ seats: 2 }))).toBe(false);
    });
    it("seats held by reservations don't count", async () => {
      expect(await matched(await alert({ seats: 3 }), await listing({ seats: 4, reserved: 2 }))).toBe(false);
      expect(await matched(await alert({ seats: 2 }), await listing({ seats: 4, reserved: 2 }))).toBe(true);
    });
    it("a partly sold listing with enough left matches", async () => {
      expect(await matched(await alert({ seats: 2 }), await listing({ seats: 2, status: "PARTIALLY_SOLD" }))).toBe(true);
    });
  });

  describe("dates", () => {
    it("matches a listing on any one of several dates", async () => {
      const a = await alert({ dates: [D1, D3] });
      expect(await matched(a, await listing({ date: D1 }))).toBe(true);
      expect(await matched(a, await listing({ date: D3 }))).toBe(true);
    });
    it("doesn't match another date", async () => {
      expect(await matched(await alert({ dates: [D1, D3] }), await listing({ date: D2 }))).toBe(false);
    });
    it("a late show counts on its own India date", async () => {
      const a = await alert({ dates: [D1] });
      expect(await matched(a, await listing({ date: D1, time: "23:30" }))).toBe(true);
      expect(await matched(await alert({ dates: [D2] }), await listing({ date: D1, time: "23:30" }))).toBe(false);
    });
    it("an alert created before dates existed takes any date", async () => {
      expect(await matched(await alert({ dates: [] }), await listing({ date: D2 }))).toBe(true);
    });
  });

  describe("event", () => {
    it("wrong category -> no match", async () => {
      expect(await matched(await alert({ category: "EVENT" }), await listing({ category: "MOVIE" }))).toBe(false);
    });
    it("name variations follow the event-name rule", async () => {
      const a = await alert({ name: "Jailer" });
      expect(await matched(a, await listing({ name: "JAILER (U/A) Telugu IMAX" }))).toBe(true);
      expect(await matched(a, await listing({ name: "Jailer 2" }))).toBe(false);
      const p = await alert({ name: "Pushpa 2" });
      expect(await matched(p, await listing({ name: "Pushpa 2: The Rule (A)" }))).toBe(true);
    });
  });

  describe("place", () => {
    it("radius: near matches, far doesn't", async () => {
      const a = await alert({ point: { ...HYD, radiusKm: 7 } });
      expect(await matched(a, await listing({ place: HYD }))).toBe(true);
      expect(await matched(a, await listing({ place: MUMBAI }))).toBe(false);
    });
    it("city only: the listing's own city", async () => {
      const a = await alert({ point: null, cityId: "hyderabad" });
      expect(await matched(a, await listing({ place: HYD }))).toBe(true);
      expect(await matched(a, await listing({ place: MUMBAI }))).toBe(false);
    });
    it("anywhere", async () => {
      expect(await matched(await alert({ point: null, cityId: null }), await listing({ place: MUMBAI }))).toBe(true);
    });
  });

  describe("people and state", () => {
    it("never the buyer's own listing", async () => {
      expect(await matched(await alert(), await listing({ sellerId: buyer }))).toBe(false);
    });
    it("not a paused or expired alert", async () => {
      expect(await matched(await alert({ isActive: false }), await listing())).toBe(false);
      expect(await matched(await alert({ expiresAt: new Date(Date.now() - 1000) }), await listing())).toBe(false);
    });
    it("not for a suspended or deleted buyer", async () => {
      const suspended = await user({ suspendedAt: new Date() });
      const deleted = await user({ deletedAt: new Date(), email: null, emailVerifiedAt: null });
      expect(await matched(await alert({ userId: suspended }), await listing())).toBe(false);
      expect(await matched(await alert({ userId: deleted }), await listing())).toBe(false);
    });
    it("not a suspended, deleted or Play-reviewer seller's listing", async () => {
      for (const data of [{ suspendedAt: new Date() }, { deletedAt: new Date() }, { isReviewAccount: true }]) {
        const s = await user(data);
        expect(await matched(await alert(), await listing({ sellerId: s }))).toBe(false);
      }
    });
    it("not a listing that's sold, withdrawn or already shown", async () => {
      const a = await alert();
      expect(await matched(a, await listing({ status: "SOLD" }))).toBe(false);
      expect(await matched(a, await listing({ status: "WITHDRAWN" }))).toBe(false);
      const l = await listing();
      await prisma.alertNotification.create({ data: { alertId: a, listingId: l, status: "SHOWN_ON_CREATE" } });
      expect(await matched(a, l)).toBe(false);
    });
    it("not a show that has already started", async () => {
      expect(await matched(await alert({ dates: [] }), await listing({ date: day(-1) }))).toBe(false);
    });
  });
});
