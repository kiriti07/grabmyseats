"use client";

import { useState } from "react";
import type { User } from "@grabmyseats/shared";
import { EmailClaimForm } from "@/components/account/EmailClaimForm";

// Shown on /account to anyone without a verified email (user.isVerified
// false) - i.e. accounts from before email login. Sign-in is by email code
// now, and only a verified email logs in, so without this they lose access
// to this account once their current session ends. Prefilled with any
// unverified email already on file; it only becomes their sign-in email
// once they enter the code sent to it.
export function AddEmailBanner({ user }: { user: User }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full max-w-xs rounded-lg border border-gold/40 bg-gold/10 p-4 text-left">
      <p className="text-sm font-medium text-foreground">Add an email to keep access</p>
      <p className="mt-1 text-xs text-muted">
        We now sign you in with a code sent by email. Confirm an email address for this account
        so you can sign back in after this session ends.
      </p>
      <div className="mt-3">
        {isOpen ? (
          <EmailClaimForm initialEmail={user.email ?? ""} />
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="w-full rounded-lg border border-line px-4 py-2 text-sm font-medium text-foreground hover:border-gold"
          >
            {user.email ? `Confirm ${user.email}` : "Add email"}
          </button>
        )}
      </div>
    </div>
  );
}
