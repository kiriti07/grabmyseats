"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { IdentifierChannel } from "@grabmyseats/shared";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { BrandCredit } from "@/components/ui/BrandCredit";
import { ApiError, requestOtp } from "@/lib/api";
import { useAuthOptions } from "@/hooks/useAuthOptions";
import { normalizeIdentifier } from "@/lib/identifier";

// Step 1 of /login (intent "signin") and /signup (intent "signup"): pick
// email or phone, get a code. Phone is only offered when the backend can
// actually deliver SMS codes (GET /api/auth/options). Both pages share the
// one OTP backend; the intent only changes what happens after the code is
// verified (see /login/verify). `next` and `ref` are carried through.
export function IdentifierAuth({ intent }: { intent: "signin" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { phoneOtpAvailable } = useAuthOptions();
  const next = searchParams.get("next");
  // Referral code from a shared link (/signup?ref=ABC123 - see
  // account/page.tsx's "Refer & Earn"). Only ever applied when an account
  // is created, never to a returning user's login.
  const ref = searchParams.get("ref");

  const [chosenChannel, setChannel] = useState<IdentifierChannel>("email");
  const channel: IdentifierChannel = phoneOtpAvailable ? chosenChannel : "email";
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function carriedParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (next) params.set("next", next);
    if (ref) params.set("ref", ref);
    return params;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const identifier = normalizeIdentifier(channel, value);
    if (!identifier) {
      setError(
        channel === "email"
          ? "Enter a valid email address"
          : "Enter your phone number with country code, e.g. +919876543210",
      );
      return;
    }

    setIsLoading(true);
    try {
      await requestOtp(channel, identifier);
      const params = carriedParams();
      params.set("channel", channel);
      params.set("identifier", identifier);
      params.set("intent", intent);
      router.push(`/login/verify?${params.toString()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  const otherQuery = carriedParams().toString();
  const otherHref = `${intent === "signin" ? "/signup" : "/login"}${otherQuery ? `?${otherQuery}` : ""}`;

  return (
    <AuthShell
      title={intent === "signin" ? "Sign in" : "Create your account"}
      subtitle={
        channel === "email"
          ? "Enter your email and we'll send you a 6-digit code"
          : "Enter your phone number and we'll text you a 6-digit code"
      }
    >
      {phoneOtpAvailable && (
        <div
          role="tablist"
          aria-label="Sign in with"
          className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface p-1"
        >
          {(["email", "phone"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={channel === c}
              onClick={() => {
                setChannel(c);
                setValue("");
                setError(null);
              }}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                channel === c ? "bg-gold text-[#1a1408]" : "text-muted hover:text-foreground"
              }`}
            >
              {c === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="identifier" className="mb-2 block text-sm font-medium text-foreground">
          {channel === "email" ? "Email" : "Phone number"}
        </label>
        <input
          id="identifier"
          type={channel === "email" ? "email" : "tel"}
          inputMode={channel === "email" ? "email" : "tel"}
          autoComplete={channel === "email" ? "email" : "tel"}
          autoCapitalize="none"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={channel === "email" ? "you@example.com" : "+919876543210"}
          className="w-full rounded-lg border border-line bg-surface px-4 py-3.5 font-sans text-lg text-foreground placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
        />
        <ErrorText>{error}</ErrorText>

        <div className="mt-6">
          <Button type="submit" isLoading={isLoading}>
            {isLoading ? "Sending..." : "Send code"}
          </Button>
        </div>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {intent === "signin" ? "New to GrabMySeats? " : "Already have an account? "}
        <Link href={otherHref} className="font-medium text-gold hover:text-gold-dim">
          {intent === "signin" ? "Sign up" : "Sign in"}
        </Link>
      </p>

      <BrandCredit />
    </AuthShell>
  );
}
