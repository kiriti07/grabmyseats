import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma";
import { identifierHash, isIdentifierHashConfigured } from "./identifierHash";
import type { IdentifierChannel } from "./validators";

// The other half of DeletedIdentifier (written by lib/accountDeletion.ts
// when a suspended account is deleted): refusing that email/phone a new
// account. Kept apart from accountDeletion.ts so lib/identity.ts can use it
// without an import cycle.

// The suspension message a refused sign-up shows - worded exactly like a
// suspended account's own login refusal (routes/auth.ts's completeLogin).
export function suspensionMessage(reason: string | null): string {
  return reason ? `Your account has been suspended: ${reason}` : "Your account has been suspended.";
}

// If this email/phone belonged to an account that was suspended when it
// was deleted, that account's suspension reason (or null for "none
// recorded"); undefined when it's free to use. Checked before creating an
// account or attaching a verified identifier to one.
export async function findSuspendedIdentifierBlock(
  channel: IdentifierChannel,
  value: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<{ reason: string | null } | undefined> {
  // Production can't start without the secret (index.ts); without it
  // elsewhere, nothing can have been hashed, so nothing is blocked.
  if (!isIdentifierHashConfigured()) return undefined;
  const row = await tx.deletedIdentifier.findUnique({
    where: { hash: identifierHash(channel, value) },
    select: { user: { select: { suspensionReason: true } } },
  });
  return row ? { reason: row.user.suspensionReason } : undefined;
}

export class SuspendedIdentifierError extends Error {
  constructor(reason: string | null) {
    super(suspensionMessage(reason));
  }
}
