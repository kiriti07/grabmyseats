import type { Prisma, User } from "../generated/prisma/client";
import { prisma } from "./prisma";

// An email is a login identity only once it's verified (emailVerifiedAt
// set). Unverified emails are just self-reported profile data - they never
// log anyone in, and they lose to anyone who later proves they own the
// address (claimVerifiedEmail below).
//
// Matching is case-insensitive throughout: new emails are stored
// lowercased (validators.ts's normalizeLoginEmail), but rows written
// before that may have mixed case, and the DB's own unique index on email
// is case-sensitive.

type Tx = Prisma.TransactionClient;

export class EmailOwnedByAnotherAccountError extends Error {}

function emailMatches(email: string) {
  return { equals: email, mode: "insensitive" as const };
}

// The user (if any) that `email` logs in as. Oldest first, purely so a
// pre-existing case-variant duplicate (impossible to create from here on -
// see claimVerifiedEmail) always resolves to the same account.
export function findUserByVerifiedEmail(email: string, tx: Tx = prisma): Promise<User | null> {
  return tx.user.findFirst({
    where: { email: emailMatches(email), emailVerifiedAt: { not: null } },
    orderBy: { createdAt: "asc" },
  });
}

// Drops every *unverified* claim on `email` held by any account other than
// `exceptUserId` - called whenever someone has just proven they own the
// address (login OTP, add-email OTP, verification link). Only email is
// cleared; emailVerifiedAt is already null on every row this matches.
export async function clearUnverifiedEmailClaims(
  tx: Tx,
  email: string,
  exceptUserId: string | null,
): Promise<void> {
  await tx.user.updateMany({
    where: {
      email: emailMatches(email),
      emailVerifiedAt: null,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    data: { email: null },
  });
}

// Makes `email` the verified login identity of `userId`, for a caller who
// has just proven they own it. The proven owner wins over any other
// account's unverified claim (cleared), but never over another account
// that has itself already verified it - that throws, since two accounts
// can't share a login identity.
export function claimVerifiedEmail(userId: string, email: string): Promise<User> {
  return prisma.$transaction(async (tx) => {
    const owner = await findUserByVerifiedEmail(email, tx);
    if (owner && owner.id !== userId) throw new EmailOwnedByAnotherAccountError();

    await clearUnverifiedEmailClaims(tx, email, userId);
    return tx.user.update({
      where: { id: userId },
      data: { email, emailVerifiedAt: new Date() },
    });
  });
}

// OTP store identifiers (see lib/otpStore.ts) for the two email-code flows.
// Namespaced so a login code can never be redeemed as (or overwrite) an
// add-email code, and the add-email one is bound to the requesting user
// as well as the address, so it can only ever attach the address to the
// account that asked for it.
export function loginOtpIdentifier(email: string): string {
  return `login:${email}`;
}

export function claimOtpIdentifier(userId: string, email: string): string {
  return `claim:${userId}:${email}`;
}

export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "P2002";
}
