import { randomInt } from "node:crypto";
import type { ReferralSummary } from "@grabmyseats/shared";
import { prisma } from "./prisma";

// Excludes visually-ambiguous characters (0/O, 1/I) - this code is meant
// to be read off a screen and retyped, not just tapped through a link.
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 7;
const MAX_GENERATION_ATTEMPTS = 10;

function randomReferralCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

// Called once, at signup, for every new user (see POST /api/auth/otp/verify) -
// never regenerated afterward. Collisions are astronomically unlikely at
// this alphabet/length (33^7 possibilities), but the unique constraint on
// User.referralCode is what actually guarantees no duplicate is ever used;
// this just retries on the rare clash instead of letting signup 500.
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = randomReferralCode();
    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique referral code");
}

// A referral only "counts" once the referred user has completed at least
// one real listing (as a seller) or reservation (as a buyer) - signup
// alone is too easy to game (see POST /api/auth/otp/verify, which only
// ever sets referredByUserId, never touches this count). Both sides of
// the OR are a distinct-user existence check, not an action count, so a
// referred user who lists/reserves many times still only ever counts once
// toward their referrer's total.
async function countQualifiedReferrals(referrerId: string): Promise<number> {
  return prisma.user.count({
    where: {
      referredByUserId: referrerId,
      OR: [{ listings: { some: {} } }, { purchases: { some: {} } }],
    },
  });
}

export const REFERRAL_MILESTONE_INTERVAL = 20;
export const REFERRAL_MILESTONE_POINTS = 200;

// Called after a referred user's first-ever qualifying listing/reservation
// (see POST /api/listings and POST /api/listings/:id/reserve) - recomputes
// the referrer's qualified-referral count from scratch and awards +200
// PointsLedger points for every 20-referral threshold newly crossed.
// referralMilestoneThreshold (the last-awarded threshold) is what makes
// this idempotent: re-running it after a referred user's second listing
// finds the same qualified count as before (they were already counted),
// so nothing gets double-awarded.
export async function checkAndAwardReferralMilestone(referrerId: string): Promise<void> {
  const qualifiedCount = await countQualifiedReferrals(referrerId);

  // A loop, not a single check, in case more than one threshold was
  // crossed between runs (e.g. this referrer's own milestone check was
  // skipped or delayed for a while) - in the common case this body runs
  // at most once.
  for (;;) {
    const referrer = await prisma.user.findUniqueOrThrow({
      where: { id: referrerId },
      select: { referralMilestoneThreshold: true },
    });
    const nextThreshold = referrer.referralMilestoneThreshold + REFERRAL_MILESTONE_INTERVAL;
    if (nextThreshold > qualifiedCount) return;

    // Conditional update, keyed on the threshold value just read - only
    // succeeds if it hasn't moved since, so two concurrent qualifying
    // events for the same referrer can never both award the same
    // milestone. The loser of that race just re-reads and retries.
    const updated = await prisma.user.updateMany({
      where: { id: referrerId, referralMilestoneThreshold: referrer.referralMilestoneThreshold },
      data: { referralMilestoneThreshold: nextThreshold },
    });
    if (updated.count === 0) continue;

    await prisma.pointsLedger.create({
      data: { userId: referrerId, amount: REFERRAL_MILESTONE_POINTS, reason: "REFERRAL_MILESTONE" },
    });
  }
}

// GET /api/users/me/referrals - see ReferralSummary in shared/src/user.ts
// for why referralLink isn't built here.
export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { referralCode: true },
  });

  const referredCount = await countQualifiedReferrals(userId);

  // Always the source of truth for the balance shown - never a
  // separately-tracked column that could drift from what was actually
  // written to PointsLedger.
  const pointsAgg = await prisma.pointsLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });

  const nextMilestoneAt =
    (Math.floor(referredCount / REFERRAL_MILESTONE_INTERVAL) + 1) * REFERRAL_MILESTONE_INTERVAL;

  return {
    referralCode: user.referralCode,
    referredCount,
    pointsBalance: pointsAgg._sum.amount ?? 0,
    nextMilestoneAt,
    referralsUntilNextMilestone: nextMilestoneAt - referredCount,
  };
}
