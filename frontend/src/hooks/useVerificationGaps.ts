"use client";

import type { User } from "@grabmyseats/shared";
import { useAuthOptions } from "@/hooks/useAuthOptions";

export type VerificationGap = "email" | "phone";

// Client-side mirror of backend/src/lib/verificationGate.ts: what this user
// still has to verify before listing, reserving, or viewing contact
// details - a verified email always, plus a verified phone while
// requirePhoneVerification is on. (isVerified/isPhoneVerified already
// account for the Play review account.) The backend enforces this anyway;
// this only lets screens prompt up front instead of failing on submit.
export function useVerificationGaps(user: User | null): VerificationGap[] {
  const { requirePhoneVerification } = useAuthOptions();
  if (!user) return [];
  const gaps: VerificationGap[] = [];
  if (!user.isVerified) gaps.push("email");
  if (requirePhoneVerification && !user.isPhoneVerified) gaps.push("phone");
  return gaps;
}
