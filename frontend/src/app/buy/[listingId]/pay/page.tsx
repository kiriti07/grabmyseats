"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError, fetchTransactionDetail, payForTransaction } from "@/lib/api";

const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return secondsLeft;
}

function PaymentStepContent() {
  const { listingId } = useParams<{ listingId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const transactionId = searchParams.get("transactionId") ?? "";
  const seats = searchParams.get("seats") ?? "0";
  const amountPaid = searchParams.get("amountPaid") ?? "0";
  const expiresAt = searchParams.get("expiresAt");

  const secondsLeft = useCountdown(expiresAt);
  const isExpired = expiresAt !== null && secondsLeft <= 0;

  const [scriptReady, setScriptReady] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This page only makes sense in escrow mode - a stale bookmark, a link
  // shared before a mode switch, or landing here after PAYMENT_MODE flips
  // mid-session should never show a dead "Pay" button (or, worse, whatever
  // escrow-only error the backend happens to throw first, e.g. a seller
  // payout-onboarding check that no longer applies to anyone). Always
  // re-verified against the live transaction rather than trusting a query
  // param, which a bookmarked URL can't be trusted to carry correctly.
  // While this check is in flight, nothing payment-related renders below.
  const [modeCheckReady, setModeCheckReady] = useState(false);

  useEffect(() => {
    if (!transactionId) {
      router.replace(`/buy/${listingId}`);
      return;
    }
    let cancelled = false;
    fetchTransactionDetail(transactionId)
      .then((detail) => {
        if (cancelled) return;
        if (detail.paymentMode !== "escrow") {
          // contact_only transactions never need this page at all - the
          // transaction detail page already has the full contact-reveal
          // view for them (see app/transactions/[transactionId]/page.tsx).
          router.replace(`/transactions/${transactionId}`);
          return;
        }
        setModeCheckReady(true);
      })
      .catch(() => {
        // Couldn't confirm the mode (e.g. a transient network error) -
        // fail toward showing the escrow flow rather than stranding a
        // legitimate escrow-mode payer on a blank page. POST /:id/pay's
        // own requireEscrowMode guard is still the authoritative backstop.
        if (!cancelled) setModeCheckReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId, listingId, router]);

  async function handlePay() {
    setError(null);
    setIsPaying(true);
    try {
      const { order } = await payForTransaction(transactionId);
      if (typeof window === "undefined" || !window.Razorpay) {
        throw new ApiError("Payment provider failed to load. Please try again.", 0);
      }
      const checkout = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "GrabMySeats",
        description: `${seats} seat(s)`,
        theme: { color: "#e8b84b" },
        handler: () => {
          // Escrow only moves to ESCROWED once our webhook verifies
          // Razorpay's payment.captured event, which the transaction
          // detail page polls for - it shows a "confirming payment" state
          // until that lands.
          const params = new URLSearchParams({ seats, amountPaid });
          router.push(`/transactions/${transactionId}?${params.toString()}`);
        },
        modal: { ondismiss: () => setIsPaying(false) },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start payment. Please try again.");
    } finally {
      setIsPaying(false);
    }
  }

  if (!modeCheckReady) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">
        Loading...
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <Script
        src={RAZORPAY_CHECKOUT_SRC}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />

      <header className="flex w-full max-w-sm items-center">
        <Link
          href={`/buy/${listingId}`}
          className="text-sm font-medium text-muted hover:text-foreground"
        >
          ← Back
        </Link>
      </header>

      <div className="mt-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="font-display text-2xl tracking-wide text-gold">Complete payment</p>
        <p className="mt-2 text-sm text-muted">
          {seats} seat{seats === "1" ? "" : "s"} reserved
        </p>
        <p className="mt-4 font-display text-3xl tracking-wide text-foreground">₹{amountPaid}</p>

        {expiresAt && !isExpired && (
          <p className="mt-3 text-sm text-muted">
            Reservation holds for {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, "0")}
          </p>
        )}

        {isExpired ? (
          <>
            <p className="mt-4 text-sm text-error">
              This reservation has expired. Go back and reserve again.
            </p>
            <div className="mt-4">
              <Link
                href={`/buy/${listingId}`}
                className="text-sm font-medium text-gold hover:text-gold-dim"
              >
                Back to listing
              </Link>
            </div>
          </>
        ) : (
          <>
            <ErrorText>{error}</ErrorText>
            <div className="mt-5">
              <Button onClick={handlePay} isLoading={isPaying} disabled={!scriptReady}>
                {isPaying ? "Starting payment..." : `Pay ₹${amountPaid}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function PaymentStepPage() {
  return (
    <Suspense fallback={null}>
      <PaymentStepContent />
    </Suspense>
  );
}
