"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { ApiError, verifyEmail } from "@/lib/api";

// Landed on from the link in the email POST /api/users/me/email/
// send-verification sends (see /account's "Verify your email" prompt) -
// https://grabmyseats.com/verify-email?token=<token>. The backend
// verification endpoint itself is deliberately unauthenticated (the token
// alone identifies the user - see GET /api/users/me/email/verify), so this
// page works whether or not the browser it's opened in has an active
// session; when it does, and it's the same account, the cached user is
// refreshed in place so the Verified badge shows immediately without a
// reload.
function VerifyEmailContent() {
  const token = useSearchParams().get("token");
  const { user, isAuthenticated, updateUser } = useAuth();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Missing verification token.");
      return;
    }

    verifyEmail(token)
      .then(({ user: verifiedUser }) => {
        if (isAuthenticated && user?.id === verifiedUser.id) {
          updateUser(verifiedUser);
        }
        setStatus("success");
      })
      .catch((err) => {
        setStatus("error");
        setError(
          err instanceof ApiError ? err.message : "Couldn't verify this email. Please try again.",
        );
      });
    // Only ever run once, against the token in the URL - re-running on
    // user/isAuthenticated changing (e.g. from the updateUser call above)
    // would just re-submit an already-consumed, single-use token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell title="Verify your email" subtitle="Confirming your email address">
      {status === "loading" && <p className="text-center text-sm text-muted">Verifying...</p>}

      {status === "success" && (
        <div className="text-center">
          <p className="text-sm text-success">Your email is verified ✓</p>
          <Link
            href="/account"
            className="mt-4 inline-block text-sm font-medium text-gold hover:text-gold-dim"
          >
            Back to account →
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="text-center">
          <p className="text-sm text-error">{error}</p>
          <Link
            href="/account"
            className="mt-4 inline-block text-sm font-medium text-gold hover:text-gold-dim"
          >
            Back to account →
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
