import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ALERT_MAX_ACTIVE, alertToday } from "@grabmyseats/shared";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { issueSessionToken } from "../lib/session";
import { matchAlerts } from "../jobs/matchAlerts";
import { FakePushSender } from "../test/fakePushSender";

// routes/alerts.ts against the throwaway Postgres: input checks, the 10
// active-alert limit, matches shown when an alert is saved (never pushed),
// edit / pause / resume / delete, and owner-only access.
describe("alerts routes", () => {
  const userIds: string[] = [];
  const listingIds: string[] = [];

  function day(offset: number): string {
    const d = new Date(`${alertToday()}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  const D1 = day(3), D2 = day(4);
  const HYD = { lat: 17.44, lng: 78.35 };
  const word = () => Array.from({ length: 7 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

  async function user() {
    const u = await prisma.user.create({ data: { email: `al-${randomUUID()}@example.com`, emailVerifiedAt: new Date() } });
    userIds.push(u.id);
    return { id: u.id, auth: { Authorization: `Bearer ${await issueSessionToken(u)}` } };
  }

  async function listing(sellerId: string, movieName: string, data: Record<string, unknown> = {}) {
    const l = await prisma.listing.create({
      data: {
        sellerId, movieName, theaterName: "T", ...{ theaterLat: HYD.lat, theaterLng: HYD.lng }, cityId: "hyderabad",
        showtime: new Date(`${D1}T19:30:00.000Z`), bookingId: `AL${randomUUID()}`.slice(0, 20),
        totalSeats: 4, availableSeats: 4, pricePerSeat: 250, ...data,
      },
    });
    listingIds.push(l.id);
    return l;
  }

  const valid = (overrides: Record<string, unknown> = {}) => ({
    titleQuery: `Jailer ${word()}`, category: "MOVIE", seatsWanted: 2, dates: [D1], ...HYD, ...overrides,
  });

  let me: Awaited<ReturnType<typeof user>>;
  let other: Awaited<ReturnType<typeof user>>;
  let seller: Awaited<ReturnType<typeof user>>;

  beforeAll(async () => {
    me = await user();
    other = await user();
    seller = await user();
  });

  afterAll(async () => {
    await prisma.alertNotification.deleteMany({ where: { alert: { userId: { in: userIds } } } });
    await prisma.pushDelivery.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pushToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.ticketAlert.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  const create = (auth: Record<string, string>, body: Record<string, unknown>) =>
    request(app).post("/api/alerts").set(auth).send(body);

  describe("creating", () => {
    it("needs a session", async () => {
      expect((await request(app).post("/api/alerts").send(valid())).status).toBe(401);
      expect((await request(app).get("/api/alerts/mine")).status).toBe(401);
    });

    it.each([
      [{ titleQuery: "" }, "Enter the event name"],
      [{ titleQuery: "(U/A) 3D" }, "Enter the event name"],
      [{ category: "CONCERT" }, "category must be"],
      [{ seatsWanted: 0 }, "seatsWanted"],
      [{ seatsWanted: 11 }, "seatsWanted"],
      [{ seatsWanted: 2.5 }, "seatsWanted"],
      [{ dates: [] }, "Pick at least one date"],
      [{ dates: ["2020-01-01"] }, "can't be in the past"],
      [{ dates: [day(400)] }, "too far ahead"],
      [{ dates: ["2026-02-30"] }, "real calendar dates"],
      [{ dates: Array.from({ length: 15 }, (_, i) => day(i + 1)) }, "at most 14"],
      [{ lat: 17.4, lng: undefined }, "lat and lng go together"],
      [{ lat: null, lng: null, cityId: "atlantis" }, "Unknown city"],
    ])("refuses %o", async (overrides, message) => {
      const res = await create(me.auth, valid(overrides));
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(message);
    });

    it("saves seats, sorted unique dates, a radius, and ends after the last date (India time)", async () => {
      const res = await create(me.auth, valid({ dates: [D2, D1, D2] }));
      expect(res.status).toBe(201);
      const { alert } = res.body.data;
      expect(alert).toMatchObject({ seatsWanted: 2, dates: [D1, D2], lat: HYD.lat, radiusKm: 7, status: "active" });
      // 23:59:59.999 IST on D2 = 18:29:59.999 UTC.
      expect(alert.expiresAt).toBe(`${D2}T18:29:59.999Z`);
    });

    it("city-only and anywhere alerts", async () => {
      const city = await create(me.auth, valid({ lat: null, lng: null, cityId: "hyderabad" }));
      expect(city.body.data.alert).toMatchObject({ lat: null, lng: null, cityId: "hyderabad" });
      const anywhere = await create(me.auth, valid({ lat: null, lng: null }));
      expect(anywhere.body.data.alert).toMatchObject({ lat: null, cityId: null });
    });

    it("events and sports default to a 50 km radius", async () => {
      const res = await create(me.auth, valid({ category: "EVENT" }));
      expect(res.body.data.alert.radiusKm).toBe(50);
    });

    it("shows listings that already match on screen, and never pushes them", async () => {
      const buyer = await user();
      await prisma.pushToken.create({ data: { userId: buyer.id, token: `fake-token-${randomUUID()}`, platform: "android" } });
      const name = `Leo ${word()}`;
      const l = await listing(seller.id, `${name} (U/A)`);
      const res = await create(buyer.auth, valid({ titleQuery: name }));
      expect(res.body.data.currentMatches).toEqual([
        expect.objectContaining({ listingId: l.id, freeSeats: 4, pricePerSeat: 250, available: true }),
      ]);
      expect(JSON.stringify(res.body.data.currentMatches)).not.toContain(seller.id);

      const push = new FakePushSender();
      expect(await matchAlerts({ userIds: [buyer.id], sender: push })).toMatchObject({ matched: 0, pushed: 0 });
      expect(push.sent).toHaveLength(0);
    });

    it(`allows ${ALERT_MAX_ACTIVE} active alerts; pausing one frees a place`, async () => {
      const u = await user();
      const ids: string[] = [];
      for (let i = 0; i < ALERT_MAX_ACTIVE; i++) ids.push((await create(u.auth, valid())).body.data.alert.id);
      const over = await create(u.auth, valid());
      expect(over.status).toBe(409);
      expect(over.body.error).toContain(`up to ${ALERT_MAX_ACTIVE} active alerts`);

      await request(app).post(`/api/alerts/${ids[0]}/pause`).set(u.auth);
      expect((await create(u.auth, valid())).status).toBe(201);
      expect((await request(app).post(`/api/alerts/${ids[0]}/resume`).set(u.auth)).status).toBe(409);
    });
  });

  describe("my alerts", () => {
    it("lists only my alerts, with their matches, and tracks what I've seen", async () => {
      const buyer = await user();
      await create(other.auth, valid());
      const name = `Kalki ${word()}`;
      const created = await create(buyer.auth, valid({ titleQuery: name }));
      const l = await listing(seller.id, name);
      await matchAlerts({ userIds: [buyer.id], sender: new FakePushSender() });

      expect((await request(app).get("/api/alerts/unseen-count").set(buyer.auth)).body.data.count).toBe(1);
      const mine = await request(app).get("/api/alerts/mine").set(buyer.auth);
      expect(mine.body.data.alerts).toHaveLength(1);
      expect(mine.body.data.alerts[0]).toMatchObject({
        id: created.body.data.alert.id,
        matches: [expect.objectContaining({ listingId: l.id, available: true, seen: false })],
      });

      await request(app).post("/api/alerts/seen").set(buyer.auth);
      expect((await request(app).get("/api/alerts/unseen-count").set(buyer.auth)).body.data.count).toBe(0);

      await prisma.listing.update({ where: { id: l.id }, data: { status: "SOLD", availableSeats: 0 } });
      const after = await request(app).get("/api/alerts/mine").set(buyer.auth);
      expect(after.body.data.alerts[0].matches[0]).toMatchObject({ available: false, seen: true });
    });
  });

  describe("changing an alert", () => {
    it("only the owner can edit, pause, resume or delete; unknown ids 404", async () => {
      const id = (await create(me.auth, valid())).body.data.alert.id;
      expect((await request(app).patch(`/api/alerts/${id}`).set(other.auth).send(valid())).status).toBe(403);
      expect((await request(app).post(`/api/alerts/${id}/pause`).set(other.auth)).status).toBe(403);
      expect((await request(app).post(`/api/alerts/${id}/resume`).set(other.auth)).status).toBe(403);
      expect((await request(app).delete(`/api/alerts/${id}`).set(other.auth)).status).toBe(403);
      expect((await request(app).delete(`/api/alerts/nope`).set(me.auth)).status).toBe(404);
    });

    it("edit replaces the fields, keeps paused state, and shows (not pushes) new matches", async () => {
      const buyer = await user();
      await prisma.pushToken.create({ data: { userId: buyer.id, token: `fake-token-${randomUUID()}`, platform: "android" } });
      const id = (await create(buyer.auth, valid())).body.data.alert.id;
      await request(app).post(`/api/alerts/${id}/pause`).set(buyer.auth);
      const name = `Devara ${word()}`;
      const l = await listing(seller.id, name, { showtime: new Date(`${D2}T10:00:00.000Z`) });

      const res = await request(app).patch(`/api/alerts/${id}`).set(buyer.auth).send(valid({ titleQuery: name, dates: [D2], seatsWanted: 4 }));
      expect(res.status).toBe(200);
      expect(res.body.data.alert).toMatchObject({ titleQuery: name, dates: [D2], seatsWanted: 4, status: "paused" });
      expect(res.body.data.currentMatches.map((m: { listingId: string }) => m.listingId)).toEqual([l.id]);

      await request(app).post(`/api/alerts/${id}/resume`).set(buyer.auth);
      const push = new FakePushSender();
      await matchAlerts({ userIds: [buyer.id], sender: push });
      expect(push.sent).toHaveLength(0);
    });

    it("an ended alert can't be resumed", async () => {
      const id = (await create(me.auth, valid())).body.data.alert.id;
      await prisma.ticketAlert.update({ where: { id }, data: { isActive: false, expiresAt: new Date(Date.now() - 1000) } });
      expect((await request(app).post(`/api/alerts/${id}/resume`).set(me.auth)).status).toBe(409);
    });

    it("delete really deletes the alert and its matches", async () => {
      const name = `Salaar ${word()}`;
      const id = (await create(me.auth, valid({ titleQuery: name }))).body.data.alert.id;
      await listing(seller.id, name);
      await matchAlerts({ userIds: [me.id], sender: new FakePushSender() });
      expect(await prisma.alertNotification.count({ where: { alertId: id } })).toBe(1);

      const res = await request(app).delete(`/api/alerts/${id}`).set(me.auth);
      expect(res.status).toBe(200);
      expect(await prisma.ticketAlert.count({ where: { id } })).toBe(0);
      expect(await prisma.alertNotification.count({ where: { alertId: id } })).toBe(0);
    });
  });
});
