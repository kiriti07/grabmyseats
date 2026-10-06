"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { IdentifierChannel } from "@grabmyseats/shared";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { IdentifierClaimForm } from "@/components/account/IdentifierClaimForm";
import { INPUT_CLASS } from "@/lib/styles";
import { useAuth } from "@/context/AuthContext";
import { useAuthOptions } from "@/hooks/useAuthOptions";
import { normalizeIdentifier } from "@/lib/identifier";
import { ApiError, completeProfile } from "@/lib/api";

// Only ever a same-origin path forwarded from /login/verify's own `next` -
// never trust it as a full URL (an absolute or protocol-relative value
// here would be an open redirect right after signup). Same helper as
// /login/verify/page.tsx's own local copy.
function safeNextPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

// The one-time "who are you" step shown only right after a brand-new
// signup (isNewAccount: true from /login/verify, the only place that ever
// links here). Two parts:
// 1. The *other* identifier - phone for an email signup, email for a phone
//    signup - verified by code (IdentifierClaimForm). Skippable: both end
//    up required, but only for listing/reserving/contact details, which
//    prompt for whatever's missing (see useVerificationGaps).
// 2. Name - plus, for an email signup that can't verify a phone right now
//    (SMS unavailable, or skipped), an optional unverified phone: needed to
//    sell, and shown to buyers marked "Unverified".
function WelcomeForm() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, updateUser } = useAuth();
  const { phoneOtpAvailable } = useAuthOptions();
  const next = safeNextPath(useSearchParams().get("next"));

  const [skippedIdentifier, setSkippedIdentifier] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hasWhatsapp, setHasWhatsapp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    // No session at all - this page is only ever reached right after a
    // successful verify, so there's nothing to complete a profile for.
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    // Already has a name on file (finished this step already, e.g. a
    // page refresh after submitting) - nothing left to do here.
    if (user?.name) {
      router.replace(next);
    }
  }, [isLoading, isAuthenticated, user, next, router]);

  if (!user) return null;

  // Which identifier this account still lacks a verified one of.
  const other: IdentifierChannel | null = !user.isVerified
    ? "email"
    : !user.isPhoneVerified
      ? "phone"
      : null;
  const canVerifyOther = other === "email" || (other === "phone" && phoneOtpAvailable);

  if (other && canVerifyOther && !skippedIdentifier) {
    return (
      <AuthShell
        title={other === "phone" ? "Add your phone number" : "Add your email"}
        subtitle={
          other === "phone"
            ? "Buyers use it to reach you when you sell. We'll text you a code to confirm it."
            : "We'll email you a code to confirm it. You'll need it to list tickets and reserve seats."
        }
      >
        <IdentifierClaimForm channel={other} />
        <button
          type="button"
          onClick={() => setSkippedIdentifier(true)}
          className="mt-5 w-full text-center text-sm font-medium text-muted hover:text-foreground"
        >
          Skip for now
        </button>
      </AuthShell>
    );
  }

  // An email signup with no verified phone may still leave an unverified
  // one here, the way every signup did before SMS codes existed.
  const offerUnverifiedPhone = other === "phone" && !user.phone;
  const phoneOnFile = !!user.phone || !!phone.trim();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter your name");
      return;
    }
    const normalizedPhone = phone.trim() ? normalizeIdentifier("phone", phone) : null;
    if (phone.trim() && !normalizedPhone) {
      setError("Enter your phone number with country code, e.g. +919876543210");
      return;
    }

    setIsSubmitting(true);
    try {
      const { user: updated } = await completeProfile({
        name: trimmedName,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(phoneOnFile ? { hasWhatsapp } : {}),
      });
      updateUser(updated);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Welcome!" subtitle="Just one more step - tell us who you are">
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">
          Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Priya Sharma"
          className={`${INPUT_CLASS} text-lg`}
        />

        {offerUnverifiedPhone && (
          <>
            <label htmlFor="phone" className="mb-2 mt-4 block text-sm font-medium text-foreground">
              Phone number{" "}
              <span className="font-normal text-muted">(required to sell tickets)</span>
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              className={`${INPUT_CLASS} text-lg`}
            />
            <p className="mt-1 text-xs text-muted">
              Shown to buyers so they can reach you, marked as unverified. You can add it later.
            </p>
          </>
        )}

        {phoneOnFile && (
          <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={hasWhatsapp}
              onChange={(e) => setHasWhatsapp(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-gold"
            />
            My number has WhatsApp
          </label>
        )}

        <ErrorText>{error}</ErrorText>

        <div className="mt-6">
          <Button type="submit" isLoading={isSubmitting}>
            {isSubmitting ? "Saving..." : "Continue"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeForm />
    </Suspense>
  );
}
