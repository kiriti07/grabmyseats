"use client";

import { useState } from "react";
import type { IdentifierChannel, User } from "@grabmyseats/shared";
import { IdentifierClaimForm } from "@/components/account/IdentifierClaimForm";
import { useAuthOptions } from "@/hooks/useAuthOptions";
import { useVerificationGaps } from "@/hooks/useVerificationGaps";

// Shown on /account while the user still has something to verify (see
// useVerificationGaps): a verified email is how most accounts sign in and
// is always needed to list, reserve or see contact details; a verified
// phone is needed too while phone verification is required. Prefilled with
// whatever unverified email/phone is already on file; each only becomes
// verified once its code is entered.
export function VerifyIdentityBanner({ user }: { user: User }) {
  const gaps = useVerificationGaps(user);
  const { phoneOtpAvailable } = useAuthOptions();
  const [open, setOpen] = useState<IdentifierChannel | null>(null);

  if (gaps.length === 0) return null;

  return (
    <div className="w-full max-w-xs rounded-lg border border-gold/40 bg-gold/10 p-4 text-left">
      <p className="text-sm font-medium text-foreground">Finish verifying your account</p>
      <p className="mt-1 text-xs text-muted">
        {gaps.includes("email")
          ? "Confirm an email address - you need it to list tickets and reserve seats, " +
            "and it's how you'll sign back in."
          : "Verify your phone number to list tickets or reserve seats."}
      </p>

      {gaps.map((gap) => (
        <div key={gap} className="mt-3">
          {open === gap ? (
            <IdentifierClaimForm
              channel={gap}
              initialValue={(gap === "email" ? user.email : user.phone) ?? ""}
              onDone={() => setOpen(null)}
            />
          ) : gap === "phone" && !phoneOtpAvailable ? (
            <p className="text-xs text-muted">Phone verification isn&apos;t available yet.</p>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(gap)}
              className="w-full rounded-lg border border-line px-4 py-2 text-sm font-medium text-foreground hover:border-gold"
            >
              {gap === "email"
                ? user.email
                  ? `Confirm ${user.email}`
                  : "Add email"
                : user.phone
                  ? `Verify ${user.phone}`
                  : "Add phone number"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
