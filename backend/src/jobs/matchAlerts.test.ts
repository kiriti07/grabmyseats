import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { FakePushSender } from "../test/fakePushSender";
import { buildMessage, cleanEventName, formatMatchAlertsLog, matchAlerts, MAX_ATTEMPTS, PUSHES_PER_USER_PER_HOUR } from "./matchAlerts";

// jobs/matchAlerts.ts end to end against the throwaway Postgres, with a fake
// push sender (no FCM, no real tokens). Every scenario gets its own buyer and
// runs the job scoped to that buyer, so parallel files never interfere.
describe("ticket alert job", () => {
  const userIds: string[] = [];
  const listingIds: string[] = [];
  const alertIds: string[] = [];

  function day(offset: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  const D1 = day(3);
  const HYD = { lat: 17.44, lng: 78.35 };

  // Each scenario's events carry their own made-up word, so one scenario's
  // listings never match another scenario's alerts.
  let tag = "";
  const N = (name: string) => `${name} ${tag}`;
  function freshTag() {
    tag = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
  }

  async function user(data: Record<string, unknown> = {}) {
    const u = await prisma.user.create({
      data: {
        email: `ma-${randomUUID()}@example.com`,
        emailVerifiedAt: new Date(),
        phone: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
        name: "Private Person",
        ...data,
      },
    });
    userIds.push(u.id);
    return u;
  }

  async function token(userId: string, value = `fake-token-${randomUUID()}`) {
    await prisma.pushToken.create({ data: { userId, token: value, platform: "android" } });
    return value;
  }

  async function listing(sellerId: string, data: Record<string, unknown> = {}) {
    const l = await prisma.listing.create({
      data: {
        sellerId,
        movieName: `${N("Jailer")} (U/A)`,
        theaterName: "Test Theater",
        theaterLat: HYD.lat,
        theaterLng: HYD.lng,
        cityId: "hyderabad",
        showtime: new Date(`${D1}T19:30:00.000Z`),
        bookingId: `MA${randomUUID()}`.slice(0, 20),
        totalSeats: 4,
        availableSeats: 4,
        pricePerSeat: 200,
        ...data,
      },
    });
    listingIds.push(l.id);
    return l;
  }

  async function alert(userId: string, data: Record<string, unknown> = {}) {
    const a = await prisma.ticketAlert.create({
      data: {
        userId,
        titleQuery: N("Jailer"),
        category: "MOVIE",
        seatsWanted: 1,
        dates: [new Date(`${D1}T00:00:00.000Z`)],
        ...HYD,
        radiusKm: 7,
        expiresAt: new Date(Date.now() + 10 * 86_400_000),
        ...data,
      },
    });
    alertIds.push(a.id);
    return a;
  }

  // A seller and a buyer with one device, and the fake sender.
  async function scene() {
    freshTag();
    const seller = await user();
    const buyer = await user();
    const device = await token(buyer.id);
    return { seller, buyer, device, push: new FakePushSender() };
  }

  const run = (buyerId: string, push: FakePushSender | null, now?: Date) =>
    matchAlerts({ userIds: [buyerId], sender: push, now });

  const rows = (alertId: string) => prisma.alertNotification.findMany({ where: { alertId } });

  afterAll(async () => {
    await prisma.alertNotification.deleteMany({ where: { alertId: { in: alertIds } } });
    await prisma.pushDelivery.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pushToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.ticketAlert.deleteMany({ where: { id: { in: alertIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("wants 2, seller lists 4 -> one push with no personal data, opening the listing", async () => {
    const { seller, buyer, device, push } = await scene();
    const a = await alert(buyer.id, { seatsWanted: 2 });
    const l = await listing(seller.id, { totalSeats: 4, availableSeats: 4 });

    const result = await run(buyer.id, push);
    expect(result).toMatchObject({ matched: 1, pushed: 1 });
    expect(push.messagesTo(device)).toEqual([
      { title: "Tickets available", body: `${N("Jailer")} (U/A), ${new Date(`${D1}T00:00:00Z`).getUTCDate()} ${new Date(`${D1}T00:00:00Z`).toUTCString().slice(8, 11)} - 4 seats near you`, path: `/buy/${l.id}` },
    ]);
    const text = JSON.stringify(push.sent);
    for (const personal of [seller.email!, seller.phone!, "Private Person", buyer.email!, seller.id]) {
      expect(text).not.toContain(personal);
    }
    expect((await rows(a.id))[0].status).toBe("SENT");
  });

  it("wants 3, seller lists 2 -> nothing; seats rise to 4 -> one push; edited again -> no second push", async () => {
    const { seller, buyer, device, push } = await scene();
    await alert(buyer.id, { seatsWanted: 3 });
    const l = await listing(seller.id, { totalSeats: 2, availableSeats: 2 });

    expect(await run(buyer.id, push)).toMatchObject({ matched: 0, pushed: 0 });
    await prisma.listing.update({ where: { id: l.id }, data: { totalSeats: 4, availableSeats: 4 } });
    expect(await run(buyer.id, push)).toMatchObject({ matched: 1, pushed: 1 });
    await prisma.listing.update({ where: { id: l.id }, data: { pricePerSeat: 150, totalSeats: 5, availableSeats: 5 } });
    expect(await run(buyer.id, push)).toMatchObject({ matched: 0, pushed: 0 });
    expect(push.messagesTo(device)).toHaveLength(1);
  });

  it("several matches -> one combined push opening My Alerts", async () => {
    const { seller, buyer, device, push } = await scene();
    await alert(buyer.id);
    await alert(buyer.id, { titleQuery: N("Leo") });
    await listing(seller.id);
    await listing(seller.id, { movieName: `${N("JAILER")} - Telugu IMAX` });
    await listing(seller.id, { movieName: `${N("Leo")} (U/A)` });

    expect(await run(buyer.id, push)).toMatchObject({ matched: 3, pushed: 1 });
    expect(push.messagesTo(device)).toEqual([
      { title: "Tickets available", body: `3 new matches: ${N("Jailer")} (U/A), ${N("JAILER")} - Telugu IMAX and 1 more`, path: "/account/alerts" },
    ]);
  });

  it(`at most ${PUSHES_PER_USER_PER_HOUR} pushes an hour - the rest wait and go out combined`, async () => {
    const { seller, buyer, device, push } = await scene();
    const now = new Date();
    for (let i = 0; i < PUSHES_PER_USER_PER_HOUR; i++) {
      await alert(buyer.id, { titleQuery: N(`Movie ${String.fromCharCode(65 + i)}x`) });
      await listing(seller.id, { movieName: N(`Movie ${String.fromCharCode(65 + i)}x`) });
      expect((await run(buyer.id, push, now)).pushed).toBe(1);
    }
    await alert(buyer.id, { titleQuery: N("Extra One") });
    await alert(buyer.id, { titleQuery: N("Extra Two") });
    await listing(seller.id, { movieName: N("Extra One") });
    await listing(seller.id, { movieName: N("Extra Two") });

    expect(await run(buyer.id, push, now)).toMatchObject({ matched: 2, pushed: 0 });
    expect(push.messagesTo(device)).toHaveLength(PUSHES_PER_USER_PER_HOUR);

    const later = new Date(now.getTime() + 61 * 60 * 1000);
    expect(await run(buyer.id, push, later)).toMatchObject({ pushed: 1 });
    expect(push.messagesTo(device).at(-1)!.body).toBe(`2 new matches: ${N("Extra One")} and ${N("Extra Two")}`);
  });

  it("a user with no device: in-app only, no push", async () => {
    freshTag();
    const seller = await user();
    const buyer = await user();
    const push = new FakePushSender();
    const a = await alert(buyer.id);
    await listing(seller.id);
    expect(await run(buyer.id, push)).toMatchObject({ matched: 1, pushed: 0, inAppOnly: 1 });
    expect(push.sent).toHaveLength(0);
    expect((await rows(a.id))[0].status).toBe("IN_APP_ONLY");
  });

  it("push switched off (or permission denied, so no token): in-app only, never pushed later", async () => {
    const { seller, buyer, device } = await scene();
    const a = await alert(buyer.id);
    await listing(seller.id);
    expect(await run(buyer.id, null)).toMatchObject({ inAppOnly: 1 });
    const later = new FakePushSender();
    expect(await run(buyer.id, later)).toMatchObject({ matched: 0, pushed: 0 });
    expect(later.messagesTo(device)).toHaveLength(0);
    expect((await rows(a.id))[0].status).toBe("IN_APP_ONLY");
  });

  it("several devices all get it; a dead token is removed", async () => {
    const { seller, buyer, device, push } = await scene();
    const second = await token(buyer.id);
    const dead = await token(buyer.id);
    push.outcomeFor(dead, "invalid-token");
    await alert(buyer.id);
    await listing(seller.id);
    expect(await run(buyer.id, push)).toMatchObject({ pushed: 1 });
    expect(push.sent[0].tokens.sort()).toEqual([device, second, dead].sort());
    expect(await prisma.pushToken.findMany({ where: { userId: buyer.id }, select: { token: true } })).toHaveLength(2);
  });

  it("every device gone: tokens removed, match in-app only", async () => {
    const { seller, buyer, device, push } = await scene();
    push.outcomeFor(device, "invalid-token");
    const a = await alert(buyer.id);
    await listing(seller.id);
    expect(await run(buyer.id, push)).toMatchObject({ pushed: 0, inAppOnly: 1 });
    expect(await prisma.pushToken.count({ where: { userId: buyer.id } })).toBe(0);
    expect((await rows(a.id))[0].status).toBe("IN_APP_ONLY");
  });

  it("a temporary failure is retried in the same delivery, and delivered once", async () => {
    const { seller, buyer, device, push } = await scene();
    push.outcomeFor(device, "retryable");
    const a = await alert(buyer.id);
    await listing(seller.id);
    await run(buyer.id, push);
    const [delivery] = await prisma.pushDelivery.findMany({ where: { userId: buyer.id } });
    expect(delivery.status).toBe("RETRY");

    push.outcomeFor(device, "sent");
    expect(await run(buyer.id, push)).toMatchObject({ pushed: 1 });
    expect(await run(buyer.id, push)).toMatchObject({ pushed: 0 });
    const deliveries = await prisma.pushDelivery.findMany({ where: { userId: buyer.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ status: "SENT", attempts: 2 });
    expect(push.messagesTo(device)).toHaveLength(2); // the refused attempt, then the delivered one
    expect((await rows(a.id))[0].status).toBe("SENT");
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts`, async () => {
    const { seller, buyer, device, push } = await scene();
    push.outcomeFor(device, "retryable");
    const a = await alert(buyer.id);
    await listing(seller.id);
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await run(buyer.id, push);
    expect(push.messagesTo(device)).toHaveLength(MAX_ATTEMPTS);
    expect((await prisma.pushDelivery.findFirstOrThrow({ where: { userId: buyer.id } })).status).toBe("FAILED");
    expect((await rows(a.id))[0].status).toBe("FAILED");
  });

  it("no answer from FCM: never retried, so never twice", async () => {
    const { seller, buyer, device, push } = await scene();
    push.outcomeFor(device, "unknown");
    const a = await alert(buyer.id);
    await listing(seller.id);
    await run(buyer.id, push);
    push.outcomeFor(device, "sent");
    await run(buyer.id, push);
    expect(push.messagesTo(device)).toHaveLength(1);
    expect((await rows(a.id))[0].status).toBe("SENT_UNCONFIRMED");
  });

  it("a push left SENDING by a crash is never sent again", async () => {
    const { seller, buyer, device, push } = await scene();
    const a = await alert(buyer.id);
    const l = await listing(seller.id);
    const delivery = await prisma.pushDelivery.create({
      data: { userId: buyer.id, status: "SENDING", matchCount: 1, createdAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    await prisma.alertNotification.create({ data: { alertId: a.id, listingId: l.id, status: "PENDING", deliveryId: delivery.id } });
    await run(buyer.id, push);
    expect(push.messagesTo(device)).toHaveLength(0);
    expect((await rows(a.id))[0].status).toBe("SENT_UNCONFIRMED");
  });

  it("two runs at once still push once", async () => {
    const { seller, buyer, device, push } = await scene();
    await alert(buyer.id);
    await listing(seller.id);
    await Promise.all([run(buyer.id, push), run(buyer.id, push), run(buyer.id, push)]);
    expect(push.messagesTo(device)).toHaveLength(1);
  });

  it("partly sold before the push goes out -> skipped", async () => {
    const { seller, buyer, device, push } = await scene();
    const now = new Date();
    // Fill the hour's quota so the match waits.
    for (let i = 0; i < PUSHES_PER_USER_PER_HOUR; i++) {
      await prisma.pushDelivery.create({ data: { userId: buyer.id, status: "SENT", matchCount: 1, createdAt: now } });
    }
    const a = await alert(buyer.id, { seatsWanted: 3 });
    const l = await listing(seller.id);
    expect(await run(buyer.id, push, now)).toMatchObject({ matched: 1, pushed: 0 });
    await prisma.listing.update({ where: { id: l.id }, data: { reservedSeats: 2 } });
    const later = new Date(now.getTime() + 61 * 60 * 1000);
    expect(await run(buyer.id, push, later)).toMatchObject({ pushed: 0, skipped: 1 });
    expect(push.messagesTo(device)).toHaveLength(0);
    expect((await rows(a.id))[0].status).toBe("SKIPPED");
  });

  it("a buyer suspended or deleted before the push -> skipped", async () => {
    for (const change of [{ suspendedAt: new Date() }, { deletedAt: new Date() }]) {
      const { seller, buyer, device, push } = await scene();
      const now = new Date();
      for (let i = 0; i < PUSHES_PER_USER_PER_HOUR; i++) {
        await prisma.pushDelivery.create({ data: { userId: buyer.id, status: "SENT", matchCount: 1, createdAt: now } });
      }
      const a = await alert(buyer.id);
      await listing(seller.id);
      await run(buyer.id, push, now);
      await prisma.user.update({ where: { id: buyer.id }, data: change });
      await run(buyer.id, push, new Date(now.getTime() + 61 * 60 * 1000));
      expect(push.messagesTo(device)).toHaveLength(0);
      expect((await rows(a.id))[0].status).toBe("SKIPPED");
    }
  });

  it("matches already notified before push (old SMS rows) are never pushed", async () => {
    const { seller, buyer, device, push } = await scene();
    const a = await alert(buyer.id);
    const l = await listing(seller.id);
    await prisma.alertNotification.create({ data: { alertId: a.id, listingId: l.id, status: "SENT" } });
    expect(await run(buyer.id, push)).toMatchObject({ matched: 0, pushed: 0 });
    expect(push.messagesTo(device)).toHaveLength(0);
  });

  it("own listing, expired alert and wrong date never push", async () => {
    const { seller, buyer, device, push } = await scene();
    await alert(buyer.id);
    await listing(buyer.id);
    await alert(buyer.id, { titleQuery: N("Leo"), expiresAt: new Date(Date.now() - 1000) });
    await listing(seller.id, { movieName: N("Leo") });
    await alert(buyer.id, { titleQuery: N("Kalki") });
    await listing(seller.id, { movieName: N("Kalki"), showtime: new Date(`${day(6)}T19:30:00.000Z`) });
    expect(await run(buyer.id, push)).toMatchObject({ matched: 0, pushed: 0 });
    expect(push.messagesTo(device)).toHaveLength(0);
  });

  describe("instant path (one listing, right after it's saved)", () => {
    const instant = (listingId: string, buyerId: string, push: FakePushSender | null) =>
      matchAlerts({ listingIds: [listingId], userIds: [buyerId], sender: push });

    it("creates exactly one notification and one push; the sweep afterwards adds nothing", async () => {
      const { seller, buyer, device, push } = await scene();
      const a = await alert(buyer.id);
      const l = await listing(seller.id);

      expect(await instant(l.id, buyer.id, push)).toMatchObject({ candidateListings: 1, matched: 1, pushed: 1 });
      expect(await run(buyer.id, push)).toMatchObject({ matched: 0, pushed: 0 });
      expect(await rows(a.id)).toHaveLength(1);
      expect((await rows(a.id))[0].status).toBe("SENT");
      expect(push.messagesTo(device)).toHaveLength(1);
    });

    it("instant and sweep at the same moment: still one notification, one push", async () => {
      const { seller, buyer, device, push } = await scene();
      const a = await alert(buyer.id);
      const l = await listing(seller.id);

      const results = await Promise.all([instant(l.id, buyer.id, push), run(buyer.id, push), instant(l.id, buyer.id, push)]);
      expect(results.reduce((n, r) => n + r.matched, 0)).toBe(1);
      expect(results.reduce((n, r) => n + r.pushed, 0)).toBe(1);
      expect(await rows(a.id)).toHaveLength(1);
      expect(push.messagesTo(device)).toHaveLength(1);
    });

    it("the sweep first, then the instant path: nothing twice", async () => {
      const { seller, buyer, device, push } = await scene();
      const a = await alert(buyer.id);
      const l = await listing(seller.id);
      expect(await run(buyer.id, push)).toMatchObject({ matched: 1, pushed: 1 });
      expect(await instant(l.id, buyer.id, push)).toMatchObject({ matched: 0, pushed: 0 });
      expect(await rows(a.id)).toHaveLength(1);
      expect(push.messagesTo(device)).toHaveLength(1);
    });

    it("same rules: never the seller's own listing, nor a suspended buyer", async () => {
      const { seller, buyer, device, push } = await scene();
      await alert(buyer.id);
      const own = await listing(buyer.id);
      expect(await instant(own.id, buyer.id, push)).toMatchObject({ matched: 0, pushed: 0 });

      await prisma.user.update({ where: { id: buyer.id }, data: { suspendedAt: new Date() } });
      const other = await listing(seller.id);
      expect(await instant(other.id, buyer.id, push)).toMatchObject({ matched: 0, pushed: 0 });
      expect(push.messagesTo(device)).toHaveLength(0);
    });

    it("same hourly cap: over it, the match waits for a later combined push", async () => {
      const { seller, buyer, device, push } = await scene();
      await alert(buyer.id);
      for (let i = 0; i < PUSHES_PER_USER_PER_HOUR; i++) {
        await prisma.pushDelivery.create({ data: { userId: buyer.id, status: "SENT", attempts: 1, matchCount: 1, sentAt: new Date() } });
      }
      const l = await listing(seller.id);
      const result = await instant(l.id, buyer.id, push);
      expect(result).toMatchObject({ matched: 1, pushed: 0 });
      expect(result.reasons.rateLimited).toBe(1);
      expect(push.messagesTo(device)).toHaveLength(0);
    });

    it("a listing matching nothing touches no one's pending matches", async () => {
      const { seller, buyer, push } = await scene();
      await alert(buyer.id);
      const unrelated = await listing(seller.id, { movieName: N("Leo") });
      expect(await instant(unrelated.id, buyer.id, push)).toMatchObject({ matched: 0, pushed: 0, inAppOnly: 0, skipped: 0 });
    });

    it("logs which path ran", async () => {
      const { buyer, push } = await scene();
      const result = await run(buyer.id, push);
      expect(formatMatchAlertsLog(result, "instant")).toMatch(/^\[jobs\] ticket alerts \(instant\): checked /);
      expect(formatMatchAlertsLog(result, "sweep")).toMatch(/^\[jobs\] ticket alerts \(sweep\): checked /);
    });
  });

  describe("message text", () => {
    const base = { id: "n", userId: "u", listingId: "L1", movieName: "Jailer", showtime: new Date("2026-10-20T19:30:00Z"), freeSeats: 4, alertCityId: null, alertHasPoint: true };

    it("says near you / in <city> / nothing, and singular seat", () => {
      expect(buildMessage([base]).body).toBe("Jailer, 20 Oct - 4 seats near you");
      expect(buildMessage([{ ...base, alertHasPoint: false, alertCityId: "hyderabad" }]).body).toBe("Jailer, 20 Oct - 4 seats in Hyderabad");
      expect(buildMessage([{ ...base, alertHasPoint: false, freeSeats: 1 }]).body).toBe("Jailer, 20 Oct - 1 seat");
    });

    it("cleans seller-typed names", () => {
      expect(cleanEventName("Free tix\nhttps://evil.example/x   call now")).toBe("Free tix call now");
      expect(cleanEventName("A".repeat(60))).toHaveLength(40);
    });
  });
});
