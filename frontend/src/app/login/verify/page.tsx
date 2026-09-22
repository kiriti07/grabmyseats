"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { OtpInput } from "@/components/auth/OtpInput";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { useAuth } from "@/context/AuthContext";
import { ApiError, requestOtp, verifyOtpCode } from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 60;

// Only ever a same-origin path forwarded from useRequireAuth.ts/
// middleware.ts's own `next` params - never trust it as a full URL
// (an absolute or protocol-relative value here would be an open redirect
// straight after login).
function safeNextPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

function VerifyForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const phone = searchParams.get("phone") ?? "";
  const next = safeNextPath(searchParams.get("next"));
  // Forwarded from /login - see that page's own comment. Only reaches the
  // backend as part of THIS verify call, never a later login.
  const ref = searchParams.get("ref");

  const [code, setCode] = useState("");
  const [otpKey, setOtpKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (!phone) {
      router.replace("/login");
    }
  }, [phone, router]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  async function handleVerify() {
    setError(null);
    if (code.length !== 6) {
      setError("Enter all 6 digits");
      return;
    }

    setIsVerifying(true);
    try {
      const { user, token, isNewAccount } = await verifyOtpCode(phone, code, ref ?? undefined);
      login(token, user);
      if (isNewAccount) {
        // Referral linking (if any) already happened inside the verify
        // call above - this step never needs the ref code itself, just
        // has to carry `next` one step further so the eventual redirect
        // still lands where the visitor was originally headed. A
        // returning user (isNewAccount: false) skips straight to `next`,
        // exactly as before.
        router.replace(`/login/welcome?next=${encodeURIComponent(next)}`);
      } else {
        router.replace(next);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    setIsResending(true);
    try {
      await requestOtp(phone);
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

  return (
    <AuthShell title="Enter the code" subtitle={`We sent a 6-digit code to ${phone || "your phone"}`}>
      <div className="mb-4 flex items-center justify-center gap-2 text-sm text-muted">
        <span>{phone}</span>
        <Link
          href={(() => {
            const params = new URLSearchParams();
            if (next !== "/") params.set("next", next);
            if (ref) params.set("ref", ref);
            const query = params.toString();
            return query ? `/login?${query}` : "/login";
          })()}
          className="font-medium text-gold hover:text-gold-dim"
        >
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
