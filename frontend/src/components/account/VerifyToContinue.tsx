import Link from "next/link";
import type { VerificationGap } from "@/hooks/useVerificationGaps";

// Shown instead of a gated action (listing a ticket, reserving seats) while
// the user still has something to verify - the backend would refuse it
// anyway (lib/verificationGate.ts). Verification itself happens on
// /account (VerifyIdentityBanner).
export function VerifyToContinue({
  gaps,
  action,
  className = "",
}: {
  gaps: VerificationGap[];
  action: string;
  className?: string;
}) {
  const what =
    gaps.length === 2
      ? "your email and phone number"
      : gaps[0] === "email"
        ? "your email"
        : "your phone number";
  return (
    <div className={`rounded-lg border border-line bg-surface p-4 text-center ${className}`}>
      <p className="text-sm font-medium text-foreground">
        Verify {what} to {action}
      </p>
      <Link
        href="/account"
        className="mt-3 inline-block text-sm font-medium text-gold hover:text-gold-dim"
      >
        Verify now →
      </Link>
    </div>
  );
}
