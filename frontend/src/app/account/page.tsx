"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReferralSummary } from "@grabmyseats/shared";
import { useAuth } from "@/context/AuthContext";
import { fetchMyReferrals } from "@/lib/api";

// A protected route example: src/middleware.ts redirects here-bound
// requests to /login when there's no session cookie at all. This
// client-side check is the second layer, for a token that's present but
// invalid or expired by the time fetchMe() runs in AuthProvider.
export default function AccountPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [referralCopyNotice, setReferralCopyNotice] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferralSummary | null>(null);
  // window.location.origin is only known once mounted in the browser -
  // computed here (not inline at render) so server-rendered and first-
  // client-render markup match, same reasoning as handleShare below only
  // ever reading it inside an event handler.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setOrigin(window.location.origin);
    // Best-effort: a failed fetch just means the "Refer & Earn" section
    // stays hidden below, not a page-level error - referral info isn't
    // essential to using the account page.
    fetchMyReferrals()
      .then(setReferrals)
      .catch(() => setReferrals(null));
  }, [isAuthenticated]);

  // /signup?ref=<code> (see backend's POST /api/auth/otp/verify) once
  // referral data has loaded; falls back to the plain app link before
  // that, or if it never loads.
  const referralLink =
    referrals && origin ? `${origin}/signup?ref=${referrals.referralCode}` : origin;

  // Native share sheet where available (mobile browsers, mostly); falls
  // back to copying the link when navigator.share isn't supported (most
  // desktop browsers). A cancelled share sheet (AbortError) isn't a
  // failure - there's nothing to show the user for that. Uses the
  // personalized referral link (once loaded) instead of a generic app
  // link, so sharing from here always credits the sharer.
  async function handleShare() {
    setShareNotice(null);
    const url = referralLink;
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

  async function handleCopyReferralLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setReferralCopyNotice("Link copied!");
    } catch {
      setReferralCopyNotice("Couldn't copy the link");
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

        {referrals && (
          <div className="w-full max-w-xs rounded-lg border border-line bg-surface p-4 text-left">
            <p className="text-sm font-medium text-foreground">Refer &amp; Earn</p>
            <p className="mt-1 text-xs text-muted">
              Share your link - once someone you refer lists or books a ticket, it counts toward
              your next reward.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={referralLink}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full truncate rounded-md border border-line bg-background px-2.5 py-2 text-xs text-muted"
              />
              <button
                type="button"
                onClick={handleCopyReferralLink}
                className="shrink-0 rounded-md border border-line px-2.5 py-2 text-xs font-medium text-foreground hover:border-gold"
              >
                Copy
              </button>
            </div>
            {referralCopyNotice && <p className="mt-1.5 text-xs text-muted">{referralCopyNotice}</p>}

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted">Points balance</span>
              <span className="font-medium text-gold">{referrals.pointsBalance}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {referrals.referralsUntilNextMilestone} more referral
              {referrals.referralsUntilNextMilestone === 1 ? "" : "s"} until your next reward (
              {referrals.referredCount}/{referrals.nextMilestoneAt})
            </p>

            <button
              type="button"
              disabled
              className="mt-3 w-full cursor-not-allowed rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted opacity-60"
            >
              Redeem - Coming Soon
            </button>
          </div>
        )}

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
