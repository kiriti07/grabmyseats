"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError, requestOtp } from "@/lib/api";

const PHONE_RE = /^\+[1-9]\d{7,14}$/;

export default function LoginPage() {
  const [phone, setPhone] = useState("+91");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = phone.trim();
    if (!PHONE_RE.test(trimmed)) {
      setError("Enter a valid phone number with country code, e.g. +919876543210");
      return;
    }

    setIsLoading(true);
    try {
      await requestOtp(trimmed);
      router.push(`/login/verify?phone=${encodeURIComponent(trimmed)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Enter your phone number and we'll text you a code"
    >
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="phone" className="mb-2 block text-sm font-medium text-foreground">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+919876543210"
          className="w-full rounded-lg border border-line bg-surface px-4 py-3.5 font-sans text-lg text-foreground placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
        />
        <ErrorText>{error}</ErrorText>

        <div className="mt-6">
          <Button type="submit" isLoading={isLoading}>
            {isLoading ? "Sending..." : "Send code"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
