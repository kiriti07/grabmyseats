"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyPurchase } from "@grabmyseats/shared";
import { formatShowtimeFull } from "@/lib/format";
import { StarPicker } from "@/components/rating/StarPicker";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError, fetchMyPurchases, rateTransaction } from "@/lib/api";

// Minimal buyer-facing purchase history - this view didn't exist before
// (only the seller side, /sell/my-listings, did). Its main job is
// surfacing the "Rate this seller" prompt for anything not yet rated;
// anything needing an in-progress action (pay, check in, confirm receipt)
// still lives on /transactions/[transactionId], linked from each row.
function describePurchaseStatus(status: MyPurchase["status"]): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "RESERVED":
      return "Reserved — awaiting payment";
    case "EXPIRED":
      return "Reservation expired";
    case "ESCROWED":
      return "Paid — awaiting handoff";
    case "BUYER_CONFIRMED":
      return "Confirmed";
    case "PAYOUT_RELEASED":
      return "Complete";
    case "DISPUTED":
      return "Under review";
    case "REFUNDED":
      return "Refunded";
  }
}

export default function MyPurchasesPage() {
  const [purchases, setPurchases] = useState<MyPurchase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ratingId, setRatingId] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyPurchases()
      .then(({ purchases }) => setPurchases(purchases))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Couldn't load your purchases.");
      });
  }, []);

  function openRating(purchaseId: string) {
    setRatingId(purchaseId);
    setStars(5);
    setComment("");
    setRatingError(null);
  }

  async function handleSubmitRating(purchaseId: string) {
    setIsSubmitting(true);
    setRatingError(null);
    try {
      await rateTransaction(purchaseId, { stars, comment: comment.trim() || undefined });
      setPurchases((prev) =>
        prev ? prev.map((p) => (p.id === purchaseId ? { ...p, isRated: true } : p)) : prev,
      );
      setRatingId(null);
    } catch (err) {
      setRatingError(
        err instanceof ApiError ? err.message : "Couldn't submit your rating. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center justify-between">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-foreground">
          ← Account
        </Link>
        <span className="font-display text-2xl tracking-wide text-gold">My Purchases</span>
      </header>

      <div className="mt-6 w-full max-w-sm flex-1">
        {error && <p className="text-center text-sm text-error">{error}</p>}
        {!error && purchases === null && (
          <p className="text-center text-sm text-muted">Loading...</p>
        )}
        {!error && purchases !== null && purchases.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted">You haven&apos;t reserved any tickets yet.</p>
            <Link
              href="/buy"
              className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-[#1a1408] hover:bg-gold-dim"
            >
              Find tickets
            </Link>
          </div>
        )}

        {purchases && purchases.length > 0 && (
          <ul className="flex flex-col gap-3">
            {purchases.map((purchase) => (
              <li key={purchase.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                <Link href={`/transactions/${purchase.id}`} className="block">
                  <p className="font-medium text-foreground">{purchase.listing.movieName}</p>
                  <p className="text-sm text-muted">{purchase.listing.theaterName}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span>{formatShowtimeFull(purchase.listing.showtime)}</span>
                    <span>{describePurchaseStatus(purchase.status)}</span>
                  </div>
                </Link>

                {purchase.isRated ? (
                  <p className="mt-3 border-t border-line pt-2.5 text-xs text-muted">
                    ✓ You rated this seller
                  </p>
                ) : (
                  <div className="mt-3 border-t border-line pt-2.5">
                    {ratingId !== purchase.id ? (
                      <button
                        type="button"
                        onClick={() => openRating(purchase.id)}
                        className="text-xs font-medium text-gold hover:text-gold-dim"
                      >
                        Rate this seller
                      </button>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <StarPicker value={stars} onChange={setStars} disabled={isSubmitting} />
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Optional comment"
                          rows={2}
                          disabled={isSubmitting}
                          className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
                        />
                        <ErrorText>{ratingError}</ErrorText>
                        <div className="flex w-full gap-2">
                          <button
                            type="button"
                            onClick={() => setRatingId(null)}
                            disabled={isSubmitting}
                            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-foreground hover:border-gold disabled:opacity-60"
                          >
                            Cancel
                          </button>
                          <div className="flex-1">
                            <Button
                              onClick={() => handleSubmitRating(purchase.id)}
                              isLoading={isSubmitting}
                            >
                              Submit
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
