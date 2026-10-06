import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@grabmyseats/shared";
import { requirePhoneVerification } from "./config";
import { isPhoneVerified, isUserVerified } from "./serialize";

type GateUser = {
  email: string | null;
  emailVerifiedAt: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  isReviewAccount: boolean;
};

// What the caller still has to verify before listing a ticket, reserving
// one, or viewing a counterparty's contact: a verified email always, plus a
// verified phone when REQUIRE_PHONE_VERIFICATION=true. Gates the requester
// only (seller at listing, buyer at reserve/contact) - a listing made
// before its seller met the gate stays reservable. The active review
// account (lib/reviewAccess.ts) always passes.
export function verificationGaps(user: GateUser): ("email" | "phone")[] {
  const gaps: ("email" | "phone")[] = [];
  if (!isUserVerified(user)) gaps.push("email");
  if (requirePhoneVerification() && !isPhoneVerified(user)) gaps.push("phone");
  return gaps;
}

// Mount after requireAuth.
export function requireVerifiedIdentity(req: Request, res: Response, next: NextFunction): void {
  const gaps = verificationGaps(req.user!);
  if (gaps.length > 0) {
    const what =
      gaps.length === 2
        ? "your email and phone number"
        : gaps[0] === "email"
          ? "your email"
          : "your phone number";
    const body: ApiResponse<never> = { success: false, error: `Verify ${what} to continue` };
    res.status(403).json(body);
    return;
  }
  next();
}
