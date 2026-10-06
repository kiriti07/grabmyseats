"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { IdentifierChannel, User } from "@grabmyseats/shared";
import { AuthShell } from "@/components/auth/AuthShell";
import { OtpInput } from "@/components/auth/OtpInput";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { useAuth } from "@/context/AuthContext";
import { ApiError, confirmSignup, requestOtp, verifyOtpCode } from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 60;

// Only ever a same-origin path forwarded from useRequireAuth.ts/
// middleware.ts's own `next` params - never trust it as a full URL
// (an absolute or protocol-relative value here would be an open redirect
// straight after login).
function safeNextPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

// Step 2 of /login and /signup (IdentifierAuth): enter the code. A verified
// code logs into the account that has this email/phone verified, whichever
// page the user came from. With no such account, sign-up creates one right
// away; sign-in creates nothing and asks "create an account?" first.
function VerifyForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  // ?email= is what links into this page looked like before phone sign-in.
  const legacyEmail = searchParams.get("email");
  const channel: IdentifierChannel =
    !legacyEmail && searchParams.get("channel") === "phone" ? "phone" : "email";
  const identifier = searchParams.get("identifier") ?? legacyEmail ?? "";
  const intent = searchParams.get("intent") === "signin" ? "signin" : "signup";
  const next = safeNextPath(searchParams.get("next"));
  // Forwarded from /signup (or a /login that turns into a sign-up below).
  // Only reaches the backend when an account is actually created.
  const ref = searchParams.get("ref");

  const [code, setCode] = useState("");
  const [otpKey, setOtpKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!identifier) {
      router.replace("/login");
    }
  }, [identifier, router]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  function finish(user: User, token: string, isNewAccount: boolean) {
    login(token, user);
    if (isNewAccount) {
      // Referral linking (if any) already happened server-side - welcome
      // just has to carry `next` one step further.
      router.replace(`/login/welcome?next=${encodeURIComponent(next)}`);
    } else {
      router.replace(next);
    }
  }

  async function handleVerify() {
    setError(null);
    if (code.length !== 6) {
      setError("Enter all 6 digits");
      return;
    }

    setIsVerifying(true);
    try {
      const result = await verifyOtpCode({
        channel,
        identifier,
        code,
        intent,
        ...(ref ? { ref } : {}),
      });
      if ("noAccount" in result) {
        setSignupToken(result.signupToken);
        setIsVerifying(false);
        return;
      }
      finish(result.user, result.token, result.isNewAccount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsVerifying(false);
    }
  }

  async function handleCreateAccount() {
    if (!signupToken) return;
    setError(null);
    setIsCreating(true);
    try {
      const { user, token, isNewAccount } = await confirmSignup(signupToken, ref ?? undefined);
      finish(user, token, isNewAccount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsCreating(false);
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    setIsResending(true);
    try {
      await requestOtp(channel, identifier);
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setOtpKey((k) => k + 1);
      setCode("");
      setNotice("Code resent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsResending(false);
    }
  }

  const backHref = (() => {
    const params = new URLSearchParams();
    if (next !== "/") params.set("next", next);
    if (ref) params.set("ref", ref);
    const query = params.toString();
    const base = intent === "signin" ? "/login" : "/signup";
    return query ? `${base}?${query}` : base;
  })();

  // Only reachable after the code was verified, so saying there's no
  // account here reveals nothing to anyone who doesn't own the identifier.
  if (signupToken) {
    return (
      <AuthShell title="No account yet" subtitle={`There's no GrabMySeats account for ${identifier}.`}>
        <Button onClick={handleCreateAccount} isLoading={isCreating}>
          {isCreating ? "Creating..." : "Create an account"}
        </Button>
        <ErrorText>{error}</ErrorText>
        <p className="mt-5 text-center text-sm text-muted">
          <Link href={backHref} className="font-medium text-gold hover:text-gold-dim">
            Use a different {channel === "email" ? "email" : "number"}
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Enter the code"
      subtitle={
        channel === "email"
          ? `If ${identifier || "that address"} can receive email, we've sent it a 6-digit code. Check your spam folder too.`
          : `If ${identifier || "that number"} can receive texts, we've sent it a 6-digit code.`
      }
    >
      <div className="mb-4 flex items-center justify-center gap-2 text-sm text-muted">
        <span className="truncate">{identifier}</span>
        <Link href={backHref} className="font-medium text-gold hover:text-gold-dim">
          edit
        </Link>
      </div>

      <OtpInput key={otpKey} onChange={setCode} disabled={isVerifying} hasError={!!error} />
      <ErrorText>{error}</ErrorText>
      {!error && notice && <p className="mt-2 text-sm text-success">{notice}</p>}

      <div className="mt-6">
        <Button onClick={handleVerify} isLoading={isVerifying}>
          {isVerifying ? "Verifying..." : "Verify"}
        </Button>
      </div>

      <div className="mt-5 text-center text-sm text-muted">
        {secondsLeft > 0 ? (
          <span>Resend code in {secondsLeft}s</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="font-medium text-gold hover:text-gold-dim disabled:opacity-60"
          >
            {isResending ? "Sending..." : "Resend code"}
          </button>
        )}
      </div>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
