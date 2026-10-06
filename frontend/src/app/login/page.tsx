"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IdentifierAuth } from "@/components/auth/IdentifierAuth";

// Sign in with email or phone - see IdentifierAuth. A verified code logs
// into the account that has that email/phone verified; with none, the
// verify step offers "create an account?" (see /login/verify).
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Referral links used to point here (/login?ref=...) before /signup
  // existed - links already shared still land on the sign-up variant.
  const ref = searchParams.get("ref");

  useEffect(() => {
    if (ref) router.replace(`/signup?${searchParams.toString()}`);
  }, [ref, router, searchParams]);

  if (ref) return null;
  return <IdentifierAuth intent="signin" />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
