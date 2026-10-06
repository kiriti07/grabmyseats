"use client";

import { Suspense } from "react";
import { IdentifierAuth } from "@/components/auth/IdentifierAuth";

// Sign up with email or phone - see IdentifierAuth. Where referral links
// (/signup?ref=...) land. If the verified email/phone already has an
// account, this just logs into it (and ?ref= is ignored); otherwise the
// account is created and the user goes on to /login/welcome.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <IdentifierAuth intent="signup" />
    </Suspense>
  );
}
