"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError, requestOtp } from "@/lib/api";

const PHONE_RE = /^\+[1-9]\d{7,14}$/;

function LoginForm() {
  const [phone, setPhone] = useState("+91");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  // Forwarded through to /login/verify, then on to the post-login
  // redirect - see useRequireAuth.ts and middleware.ts, which are what
  // actually set this when a protected route bounces someone here.
  const next = useSearchParams().get("next");

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
      const params = new URLSearchParams({ phone: trimmed });
      if (next) params.set("next", next);
      router.push(`/login/verify?${params.toString()}`);
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

      <p className="mt-8 text-center text-xs text-muted">Powered by Brilliant Eight</p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
