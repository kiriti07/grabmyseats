"use client";

import { useState } from "react";
import type { User } from "@grabmyseats/shared";
import { OtpInput } from "@/components/auth/OtpInput";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { useAuth } from "@/context/AuthContext";
import { ApiError, requestEmailClaimCode, verifyEmailClaimCode } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Two steps - address, then the 6-digit code emailed to it - and nothing
// changes on the account until the code is redeemed (POST
// /api/users/me/email/claim/verify), so the address only ever becomes this
// account's sign-in email once it's proven. Used by AddEmailBanner on
// /account and by "Change" next to the sign-in email on /account/profile.
// Deliberately no <form> and only type="button" buttons: on the profile
// page this renders inside that page's own form, and must neither nest a
// form nor submit the outer one.
export function EmailClaimForm({
  initialEmail = "",
  onDone,
}: {
  initialEmail?: string;
  onDone?: (user: User) => void;
}) {
  const { updateUser } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [otpKey, setOtpKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSend() {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    setIsBusy(true);
    try {
      await requestEmailClaimCode(trimmed);
      setSentTo(trimmed);
      setCode("");
      setOtpKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleVerify() {
    if (!sentTo) return;
    setError(null);
    if (code.length !== 6) {
      setError("Enter all 6 digits");
      return;
    }
    setIsBusy(true);
    try {
      const { user } = await verifyEmailClaimCode(sentTo, code);
      updateUser(user);
      onDone?.(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <div>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="you@example.com"
          className={INPUT_CLASS}
        />
        <ErrorText>{error}</ErrorText>
        <div className="mt-3">
          <Button type="button" onClick={handleSend} isLoading={isBusy}>
            {isBusy ? "Sending..." : "Send code"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Enter the 6-digit code we sent to {sentTo}.{" "}
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
          className="font-medium text-gold hover:text-gold-dim"
        >
          Change address
        </button>
      </p>
      <OtpInput key={otpKey} onChange={setCode} disabled={isBusy} hasError={!!error} />
      <ErrorText>{error}</ErrorText>
      <div className="mt-3">
        <Button type="button" onClick={handleVerify} isLoading={isBusy}>
          {isBusy ? "Verifying..." : "Verify"}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => handleSend()}
        disabled={isBusy}
        className="mt-3 w-full text-center text-xs font-medium text-gold hover:text-gold-dim disabled:opacity-60"
      >
        Resend code
      </button>
    </div>
  );
}
