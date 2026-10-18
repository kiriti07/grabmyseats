import { Router } from "express";
import type { ApiResponse } from "@grabmyseats/shared";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

// Devices that receive ticket-alert push notifications (Firebase Cloud
// Messaging). The Android app registers its token after sign-in once
// notification permission is granted, again whenever FCM refreshes it, and
// removes it on sign-out. Tokens are opaque strings from Google; nothing
// else about the device is stored.

export const pushTokensRouter = Router();

// Latest devices kept per account - the oldest go first.
export const MAX_TOKENS_PER_USER = 10;
const TOKEN_RE = /^[A-Za-z0-9_:\-.]{20,4096}$/;

function readToken(body: unknown): string | null {
  const token = (body as { token?: unknown } | undefined)?.token;
  return typeof token === "string" && TOKEN_RE.test(token) ? token : null;
}

// Registration is logged with counts and fixed reasons only - never the
// token, the account or a database error's message (which can quote it).
pushTokensRouter.post("/tokens", requireAuth, async (req, res) => {
  const token = readToken(req.body);
  if (!token || req.body?.platform !== "android") {
    console.warn(`[push] token registration failed: ${!token ? "invalid-token" : "invalid-platform"}`);
    const body: ApiResponse<never> = { success: false, error: "A valid token and platform \"android\" are required" };
    res.status(400).json(body);
    return;
  }

  const userId = req.user!.id;
  let count: number;
  try {
    // A device that signs into another account moves to it.
    await prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform: "android" },
      update: { userId, lastSeenAt: new Date() },
    });

    const extra = await prisma.pushToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      skip: MAX_TOKENS_PER_USER,
      select: { id: true },
    });
    if (extra.length > 0) await prisma.pushToken.deleteMany({ where: { id: { in: extra.map((t) => t.id) } } });
    count = await prisma.pushToken.count({ where: { userId } });
  } catch (err) {
    const code = err instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(err.code) ? err.code : "unknown";
    console.error(`[push] token registration failed: db-error:${code}`);
    const body: ApiResponse<never> = { success: false, error: "Couldn't save this device - please try again later" };
    res.status(500).json(body);
    return;
  }

  console.log(`[push] token registered (count=${count})`);
  const body: ApiResponse<{ registered: true }> = { success: true, data: { registered: true } };
  res.json(body);
});

// Sign-out: this device stops receiving this account's notifications. Only
// ever the caller's own token.
pushTokensRouter.delete("/tokens", requireAuth, async (req, res) => {
  const token = readToken(req.body);
  if (!token) {
    const body: ApiResponse<never> = { success: false, error: "A valid token is required" };
    res.status(400).json(body);
    return;
  }
  await prisma.pushToken.deleteMany({ where: { token, userId: req.user!.id } });
  const body: ApiResponse<{ removed: true }> = { success: true, data: { removed: true } };
  res.json(body);
});
