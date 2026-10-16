import { Router } from "express";
import {
  ALERT_MAX_ACTIVE,
  ALERT_MAX_SEATS,
  ALERT_RADIUS_DEFAULT_KM,
  alertDatesProblem,
  alertExpiresAt,
  cityNameForId,
  normalizeAlertDates,
  type ApiResponse,
  type Category,
  type TicketAlertMatch,
  type TicketAlertSaveResult,
  type TicketAlertWithMatches,
} from "@grabmyseats/shared";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { toSharedTicketAlert } from "../lib/serialize";
import { findAlertMatches } from "../lib/alertMatching";
import { eventKey } from "../lib/eventName";

// Ticket alerts ("Notify me"): create, list (with their matches), edit,
// pause/resume and delete - all owner-only. Matching and push notifications
// happen in jobs/matchAlerts.ts; listings that already match when an alert
// is saved are returned here and recorded as SHOWN_ON_CREATE, never pushed.

export const alertsRouter = Router();

const ALL_CATEGORIES: Category[] = ["MOVIE", "EVENT", "SPORT"];
const MAX_TITLE_LENGTH = 120;
const MAX_RADIUS_KM = 200;
const MATCHES_PER_ALERT = 20;

interface AlertFields {
  titleQuery: string;
  category: Category;
  seatsWanted: number;
  dates: Date[];
  expiresAt: Date;
  cityId: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// The whole alert from a request body (the form always sends all of it), or
// the list of problems.
function parseAlert(body: Record<string, unknown> | undefined): AlertFields | string[] {
  const errors: string[] = [];

  const titleQuery = typeof body?.titleQuery === "string" ? body.titleQuery.trim() : "";
  if (!titleQuery || !eventKey(titleQuery)) errors.push("Enter the event name");
  else if (titleQuery.length > MAX_TITLE_LENGTH) errors.push(`The event name can be at most ${MAX_TITLE_LENGTH} characters`);

  const category = body?.category as Category;
  if (!ALL_CATEGORIES.includes(category)) errors.push(`category must be one of ${ALL_CATEGORIES.join(", ")}`);

  const seatsWanted = finiteNumber(body?.seatsWanted);
  if (seatsWanted === null || !Number.isInteger(seatsWanted) || seatsWanted < 1 || seatsWanted > ALERT_MAX_SEATS) {
    errors.push(`seatsWanted must be a whole number from 1 to ${ALERT_MAX_SEATS}`);
  }

  const datesProblem = alertDatesProblem(body?.dates);
  if (datesProblem) errors.push(datesProblem);

  // Place: a point (with radius), else a city, else anywhere.
  const lat = body?.lat === undefined || body?.lat === null ? null : finiteNumber(body.lat);
  const lng = body?.lng === undefined || body?.lng === null ? null : finiteNumber(body.lng);
  const hasLat = body?.lat !== undefined && body?.lat !== null;
  const hasLng = body?.lng !== undefined && body?.lng !== null;
  if (hasLat !== hasLng) errors.push("lat and lng go together");
  if (hasLat && (lat === null || lat < -90 || lat > 90)) errors.push("lat must be a number between -90 and 90");
  if (hasLng && (lng === null || lng < -180 || lng > 180)) errors.push("lng must be a number between -180 and 180");

  const cityId = typeof body?.cityId === "string" && body.cityId ? body.cityId : null;
  if (cityId && !cityNameForId(cityId)) errors.push("Unknown city");

  let radiusKm = ALL_CATEGORIES.includes(category) ? ALERT_RADIUS_DEFAULT_KM[category] : 7;
  if (body?.radiusKm !== undefined && body?.radiusKm !== null) {
    const r = finiteNumber(body.radiusKm);
    if (r === null || r <= 0 || r > MAX_RADIUS_KM) errors.push(`radiusKm must be between 0 and ${MAX_RADIUS_KM}`);
    else radiusKm = r;
  }

  if (errors.length > 0) return errors;
  const dates = normalizeAlertDates(body!.dates as string[]);
  return {
    titleQuery,
    category,
    seatsWanted: seatsWanted!,
    dates: dates.map((d) => new Date(`${d}T00:00:00.000Z`)),
    expiresAt: alertExpiresAt(dates),
    cityId,
    lat,
    lng,
    radiusKm,
  };
}

function badRequest(res: import("express").Response, errors: string[]): void {
  const body: ApiResponse<never> = { success: false, error: errors.join("; ") };
  res.status(400).json(body);
}

function activeAlertCount(userId: string, exceptId?: string): Promise<number> {
  return prisma.ticketAlert.count({
    where: { userId, isActive: true, expiresAt: { gt: new Date() }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
}

function tooManyAlerts(res: import("express").Response): void {
  const body: ApiResponse<never> = {
    success: false,
    error: `You can have up to ${ALERT_MAX_ACTIVE} active alerts. Pause or delete one first.`,
  };
  res.status(409).json(body);
}

async function listingMatches(listingIds: string[], seen: Set<string> | null): Promise<TicketAlertMatch[]> {
  if (listingIds.length === 0) return [];
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds } },
    select: {
      id: true, movieName: true, showtime: true, availableSeats: true, reservedSeats: true,
      pricePerSeat: true, cityId: true, status: true,
    },
  });
  const byId = new Map(listings.map((l) => [l.id, l]));
  return listingIds.flatMap((id) => {
    const l = byId.get(id);
    if (!l) return [];
    return [{
      listingId: l.id,
      movieName: l.movieName,
      showtime: l.showtime.toISOString(),
      freeSeats: l.availableSeats - l.reservedSeats,
      pricePerSeat: l.pricePerSeat,
      cityId: l.cityId,
      available: l.status === "ACTIVE" || l.status === "PARTIALLY_SOLD",
      seen: seen ? seen.has(id) : true,
    }];
  });
}

// Saves an alert switched off, records what already matches it as shown
// (never pushed), then sets the wanted active state - so the job, which
// only looks at active alerts, can't push those matches in between.
async function saveAlert(
  userId: string,
  fields: AlertFields,
  existingId: string | null,
  isActive: boolean,
): Promise<TicketAlertSaveResult> {
  const draft = existingId
    ? await prisma.ticketAlert.update({ where: { id: existingId }, data: { ...fields, isActive: false } })
    : await prisma.ticketAlert.create({ data: { ...fields, userId, isActive: false } });

  const current = await findAlertMatches({ alertIds: [draft.id], includeInactive: true });
  if (current.length > 0) {
    await prisma.alertNotification.createMany({
      data: current.map((m) => ({ alertId: draft.id, listingId: m.listingId, status: "SHOWN_ON_CREATE" as const, seenAt: new Date() })),
      skipDuplicates: true,
    });
  }
  const saved = await prisma.ticketAlert.update({ where: { id: draft.id }, data: { isActive } });
  return {
    alert: toSharedTicketAlert(saved),
    currentMatches: await listingMatches(current.map((m) => m.listingId), null),
  };
}

async function ownAlert(req: import("express").Request, res: import("express").Response) {
  const alert = await prisma.ticketAlert.findUnique({ where: { id: req.params.id as string } });
  if (!alert) {
    const body: ApiResponse<never> = { success: false, error: "Alert not found" };
    res.status(404).json(body);
    return null;
  }
  if (alert.userId !== req.user!.id) {
    const body: ApiResponse<never> = { success: false, error: "Only the owner of this alert can change it" };
    res.status(403).json(body);
    return null;
  }
  return alert;
}

alertsRouter.post("/", requireAuth, async (req, res) => {
  const fields = parseAlert(req.body);
  if (Array.isArray(fields)) return badRequest(res, fields);
  if ((await activeAlertCount(req.user!.id)) >= ALERT_MAX_ACTIVE) return tooManyAlerts(res);

  const body: ApiResponse<TicketAlertSaveResult> = {
    success: true,
    data: await saveAlert(req.user!.id, fields, null, true),
  };
  res.status(201).json(body);
});

// The caller's alerts, newest first, each with its matches (newest first,
// at most MATCHES_PER_ALERT) - skipped ones (no longer matching by the time
// they'd have been sent) aren't shown.
alertsRouter.get("/mine", requireAuth, async (req, res) => {
  const alerts = await prisma.ticketAlert.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: {
      notifications: {
        where: { status: { not: "SKIPPED" } },
        orderBy: { notifiedAt: "desc" },
        take: MATCHES_PER_ALERT,
        select: { listingId: true, seenAt: true },
      },
    },
  });
  const now = new Date();
  const result: TicketAlertWithMatches[] = [];
  for (const { notifications, ...alert } of alerts) {
    const seen = new Set(notifications.filter((n) => n.seenAt).map((n) => n.listingId));
    result.push({
      ...toSharedTicketAlert(alert, now),
      matches: await listingMatches(notifications.map((n) => n.listingId), seen),
    });
  }
  const body: ApiResponse<{ alerts: TicketAlertWithMatches[] }> = { success: true, data: { alerts: result } };
  res.json(body);
});

// For the dot on Account -> My Alerts.
alertsRouter.get("/unseen-count", requireAuth, async (req, res) => {
  const count = await prisma.alertNotification.count({
    where: { alert: { userId: req.user!.id }, seenAt: null, status: { not: "SKIPPED" } },
  });
  const body: ApiResponse<{ count: number }> = { success: true, data: { count } };
  res.json(body);
});

// Called when My Alerts is opened.
alertsRouter.post("/seen", requireAuth, async (req, res) => {
  await prisma.alertNotification.updateMany({
    where: { alert: { userId: req.user!.id }, seenAt: null },
    data: { seenAt: new Date() },
  });
  const body: ApiResponse<{ ok: true }> = { success: true, data: { ok: true } };
  res.json(body);
});

// Full replace of the alert's fields; keeps its paused/active state.
// Listings that match the edited alert right away are shown, not pushed.
alertsRouter.patch("/:id", requireAuth, async (req, res) => {
  const alert = await ownAlert(req, res);
  if (!alert) return;
  const fields = parseAlert(req.body);
  if (Array.isArray(fields)) return badRequest(res, fields);
  const wasLive = alert.isActive && alert.expiresAt > new Date();
  if (alert.isActive && !wasLive && (await activeAlertCount(req.user!.id, alert.id)) >= ALERT_MAX_ACTIVE) {
    return tooManyAlerts(res);
  }

  const body: ApiResponse<TicketAlertSaveResult> = {
    success: true,
    data: await saveAlert(req.user!.id, fields, alert.id, alert.isActive),
  };
  res.json(body);
});

alertsRouter.post("/:id/pause", requireAuth, async (req, res) => {
  const alert = await ownAlert(req, res);
  if (!alert) return;
  const updated = await prisma.ticketAlert.update({ where: { id: alert.id }, data: { isActive: false } });
  const body: ApiResponse<{ alert: ReturnType<typeof toSharedTicketAlert> }> = { success: true, data: { alert: toSharedTicketAlert(updated) } };
  res.json(body);
});

alertsRouter.post("/:id/resume", requireAuth, async (req, res) => {
  const alert = await ownAlert(req, res);
  if (!alert) return;
  if (alert.expiresAt <= new Date()) {
    const body: ApiResponse<never> = { success: false, error: "This alert has ended - edit its dates first" };
    res.status(409).json(body);
    return;
  }
  if (!alert.isActive && (await activeAlertCount(req.user!.id)) >= ALERT_MAX_ACTIVE) return tooManyAlerts(res);
  const updated = await prisma.ticketAlert.update({ where: { id: alert.id }, data: { isActive: true } });
  const body: ApiResponse<{ alert: ReturnType<typeof toSharedTicketAlert> }> = { success: true, data: { alert: toSharedTicketAlert(updated) } };
  res.json(body);
});

// A real delete: the alert and its match history go.
alertsRouter.delete("/:id", requireAuth, async (req, res) => {
  const alert = await ownAlert(req, res);
  if (!alert) return;
  await prisma.$transaction([
    prisma.alertNotification.deleteMany({ where: { alertId: alert.id } }),
    prisma.ticketAlert.delete({ where: { id: alert.id } }),
  ]);
  const body: ApiResponse<{ deleted: true }> = { success: true, data: { deleted: true } };
  res.json(body);
});
