"use client";

import { useState } from "react";
import type { IdentifierChannel, User } from "@grabmyseats/shared";
import { OtpInput } from "@/components/auth/OtpInput";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { useAuth } from "@/context/AuthContext";
import { normalizeIdentifier } from "@/lib/identifier";
import { ApiError, requestIdentifierClaimCode, verifyIdentifierClaimCode } from "@/lib/api";

// Two steps - an email or phone, then the 6-digit code sent to it - and
// nothing changes on the account until the code is redeemed (POST
// /api/users/me/identifiers/claim/verify), so it only ever becomes this
// account's verified email/phone once it's proven. Used by
// VerifyIdentityBanner on /account, the second-identifier step of
// /login/welcome, and "Change"/"Verify" on /account/profile.
// Deliberately no <form> and only type="button" buttons: on the profile
// page this renders inside that page's own form, and must neither nest a
// form nor submit the outer one.
export function IdentifierClaimForm({
  channel,
  initialValue = "",
  onDone,
}: {
  channel: IdentifierChannel;
  initialValue?: string;
  onDone?: (user: User) => void;
}) {
  const { updateUser } = useAuth();
  const [value, setValue] = useState(initialValue);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [otpKey, setOtpKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSend() {
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
    setIsBusy(true);
    try {
      await requestIdentifierClaimCode(channel, identifier);
      setSentTo(identifier);
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
      const { user } = await verifyIdentifierClaimCode(channel, sentTo, code);
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
          type={channel === "email" ? "email" : "tel"}
          inputMode={channel === "email" ? "email" : "tel"}
          autoComplete={channel === "email" ? "email" : "tel"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={channel === "email" ? "you@example.com" : "+919876543210"}
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
          {channel === "email" ? "Change address" : "Change number"}
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
