"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { useAuth } from "@/context/AuthContext";
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
// signup (POST /api/auth/otp/verify's isNewAccount: true - see
// /login/verify/page.tsx, the only place that ever links here). A
// returning user's Sign In flow never passes through this page, and this
// page never touches or replaces that flow - it's a separate, additive
// screen reached only after a session already exists.
function WelcomeForm() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, updateUser } = useAuth();
  const next = safeNextPath(useSearchParams().get("next"));

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter your name");
      return;
    }

    setIsSubmitting(true);
    try {
      const { user: updated } = await completeProfile({
        name: trimmedName,
        email: email.trim() || undefined,
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

        <label htmlFor="email" className="mb-2 mt-4 block text-sm font-medium text-foreground">
          Email <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="priya@example.com"
          className={`${INPUT_CLASS} text-lg`}
        />

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
