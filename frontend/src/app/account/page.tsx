"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

// A protected route example: src/middleware.ts redirects here-bound
// requests to /login when there's no session cookie at all. This
// client-side check is the second layer, for a token that's present but
// invalid or expired by the time fetchMe() runs in AuthProvider.
export default function AccountPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Native share sheet where available (mobile browsers, mostly); falls
  // back to copying the link when navigator.share isn't supported (most
  // desktop browsers). A cancelled share sheet (AbortError) isn't a
  // failure - there's nothing to show the user for that.
  async function handleShare() {
    setShareNotice(null);
    const url = window.location.origin;
    if (navigator.share) {
      try {
        await navigator.share({ title: "GrabMySeats", url });
      } catch {
        // cancelled or unsupported mid-call - ignore
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNotice("Link copied!");
    } catch {
      setShareNotice("Couldn't copy the link");
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">
        Loading...
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">
        Session expired. Redirecting to sign in...
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center">
        <Link href="/" className="text-sm font-medium text-muted hover:text-foreground">
          ← Home
        </Link>
      </header>

      <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-display text-3xl tracking-wide text-foreground">Your account</h1>
        <p className="text-muted">{user.phone}</p>

        <div className="flex w-full max-w-xs flex-col gap-2">
          <Link
            href="/account/profile"
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:border-gold"
          >
            Edit Profile
          </Link>
          <Link
            href="/sell/my-listings"
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:border-gold"
          >
            My Listings
          </Link>
          <Link
            href="/account/purchases"
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:border-gold"
          >
            My Purchases
          </Link>
          <Link
            href="/account/alerts"
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:border-gold"
          >
            My Alerts
          </Link>
          <button
            onClick={handleShare}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:border-gold"
          >
            Share GrabMySeats
          </button>
          {shareNotice && <p className="-mt-1 text-xs text-muted">{shareNotice}</p>}
          <Link
            href="/terms"
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:border-gold"
          >
            Terms &amp; Conditions
          </Link>
          <Link
            href="/privacy"
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:border-gold"
          >
            Privacy Policy
          </Link>
          <Link
            href="/help"
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:border-gold"
          >
            Help Center
          </Link>
        </div>

        <button
          onClick={logout}
          className="mt-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-foreground hover:border-gold"
        >
          Log out
        </button>
      </div>
    </main>
  );
}
