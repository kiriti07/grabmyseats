"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type {
  DeliveryMethod,
  TransactionContact,
  TransactionDetail,
  TransactionEmailForward,
} from "@grabmyseats/shared";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { RatingSummaryBadge } from "@/components/ui/RatingSummaryBadge";
import { ReportUserButton } from "@/components/report/ReportUserButton";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { formatShowtimeFull, formatTimeOnly } from "@/lib/format";
import { getCheckInWindow } from "@/lib/checkInWindow";
import { CONTACT_ONLY_DISCLAIMER } from "@/lib/paymentMode";
import {
  ApiError,
  checkInToTransaction,
  confirmReceipt,
  fetchTransactionContact,
  fetchTransactionDetail,
  fetchTransactionEmailForward,
  fetchTransactionScreenshot,
  submitEmailForward,
} from "@/lib/api";

// Fast poll while waiting on the payment.captured webhook to land - this
// is normally near-instant, so a short interval keeps the "confirming
// your payment" wait feeling responsive.
const PAYMENT_POLL_INTERVAL_MS = 3000;
const PAYMENT_POLL_MAX_ATTEMPTS = 20;

// Slower poll while waiting on the other party to check in near the venue -
// this can be a multi-minute real-world wait, so there's no need to hammer
// the server the way the payment-confirmation poll does.
const CHECK_IN_POLL_INTERVAL_MS = 20000;
const CHECK_IN_POLL_MAX_ATTEMPTS = 200; // ~66 min, comfortably past the latest the window ever stays open

type ScreenshotState = "idle" | "loading" | "ready" | "error";

// Fallback plain-language status for the statuses this page doesn't have
// bespoke UI for (RESERVED gets its own "confirming payment" screen,
// ESCROWED gets the full check-in/contact/confirm-receipt UI below).
function describeOtherStatus(status: TransactionDetail["transaction"]["status"]): string | null {
  switch (status) {
    case "DISPUTED":
      return "This transaction is under review by an admin.";
    case "REFUNDED":
      return "This transaction was refunded.";
    case "EXPIRED":
      return "This reservation expired before payment was completed.";
    default:
      return null;
  }
}

function TransactionDetailContent() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const searchParams = useSearchParams();
  const seats = searchParams.get("seats");
  const amountPaid = searchParams.get("amountPaid");

  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [screenshotState, setScreenshotState] = useState<ScreenshotState>("idle");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const [contact, setContact] = useState<TransactionContact | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const contactRequestedRef = useRef(false);

  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [emailForwardState, setEmailForwardState] = useState<ScreenshotState>("idle");
  const [emailForward, setEmailForward] = useState<TransactionEmailForward | null>(null);

  const [emailFile, setEmailFile] = useState<File | null>(null);
  const [emailText, setEmailText] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [submitEmailError, setSubmitEmailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      try {
        const data = await fetchTransactionDetail(transactionId);
        if (cancelled) return;
        setDetail(data);
        setDetailError(null);

        const { status } = data.transaction;
        // Whether everything confirm-receipt requires has happened yet.
        // IN_PERSON needs both parties' venue check-in; EMAIL_FORWARD
        // needs the buyer's check-in plus the seller's forwarded email -
        // see the matching gate in POST /api/transactions/:id/confirm-receipt.
        const confirmReceiptReady =
          data.transaction.deliveryMethod === "IN_PERSON"
            ? Boolean(data.transaction.buyerCheckInAt && data.transaction.sellerCheckInAt)
            : Boolean(data.transaction.buyerCheckInAt && data.transaction.emailForwardSubmittedAt);

        attempts += 1;
        // contact_only reservations never leave RESERVED and have nothing
        // further to wait on - see the paymentMode === "contact_only"
        // render branch below, which shows the contact reveal immediately
        // instead of the "confirming your payment" wait, so polling never
        // continues for them regardless of status.
        const isEscrow = data.paymentMode === "escrow";
        if (isEscrow && status === "RESERVED" && attempts < PAYMENT_POLL_MAX_ATTEMPTS) {
          setTimeout(poll, PAYMENT_POLL_INTERVAL_MS);
        } else if (
          isEscrow &&
          status === "ESCROWED" &&
          !confirmReceiptReady &&
          attempts < CHECK_IN_POLL_MAX_ATTEMPTS
        ) {
          setTimeout(poll, CHECK_IN_POLL_INTERVAL_MS);
        }
        // Any other status (or attempts exhausted): stop polling - nothing
        // left that's going to change on its own from here.
      } catch (err) {
        if (cancelled) return;
        setDetailError(
          err instanceof ApiError ? err.message : "Couldn't load this transaction.",
        );
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  // Buyer's proof-of-purchase screenshot - fetched once we know (from
  // detail) that the transaction has actually reached ESCROWED or later,
  // instead of the previous blind poll-and-retry-on-409 approach.
  useEffect(() => {
    if (!detail || detail.party !== "buyer") return;
    if (detail.transaction.status === "RESERVED" || detail.transaction.status === "PENDING") return;
    if (screenshotState !== "idle") return;

    let cancelled = false;
    setScreenshotState("loading");
    fetchTransactionScreenshot(transactionId)
      .then(({ screenshotUrl }) => {
        if (cancelled) return;
        setScreenshotUrl(screenshotUrl);
        setScreenshotState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setScreenshotState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [detail, screenshotState, transactionId]);

  // Buyer's view of the seller-forwarded booking email (EMAIL_FORWARD
  // only) - fetched once the flag on the transaction itself says the
  // seller has submitted it, same "fetch once, not a poll" shape as the
  // screenshot above (the flag is what's kept up to date by the main poll
  // loop; this just pulls the actual content behind it).
  useEffect(() => {
    if (!detail || detail.party !== "buyer") return;
    if (detail.transaction.deliveryMethod !== "EMAIL_FORWARD") return;
    if (!detail.transaction.emailForwardSubmittedAt) return;
    if (emailForwardState !== "idle") return;

    let cancelled = false;
    setEmailForwardState("loading");
    fetchTransactionEmailForward(transactionId)
      .then((data) => {
        if (cancelled) return;
        setEmailForward(data);
        setEmailForwardState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setEmailForwardState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [detail, emailForwardState, transactionId]);

  // IN_PERSON needs both parties' venue check-in; EMAIL_FORWARD needs the
  // buyer's check-in plus the seller's forwarded email - mirrors the
  // confirmReceiptReady gate computed inside the main poll loop above.
  const confirmReceiptReady =
    detail?.transaction.deliveryMethod === "IN_PERSON"
      ? Boolean(detail?.transaction.buyerCheckInAt && detail?.transaction.sellerCheckInAt)
      : Boolean(detail?.transaction.buyerCheckInAt && detail?.transaction.emailForwardSubmittedAt);

  // Fetch contact once the confirm-receipt gate is satisfied, not on every
  // poll tick - a reasonable proxy for "close to showtime" either way.
  useEffect(() => {
    if (!confirmReceiptReady || contactRequestedRef.current) return;
    contactRequestedRef.current = true;
    fetchTransactionContact(transactionId)
      .then(({ contact }) => setContact(contact))
      .catch((err) => {
        setContactError(
          err instanceof ApiError ? err.message : "Couldn't load contact details.",
        );
      });
  }, [confirmReceiptReady, transactionId]);

  const handleCheckIn = useCallback(() => {
    setCheckInError(null);

    if (!navigator.geolocation) {
      setCheckInError("Enable location access to check in");
      return;
    }

    setIsCheckingIn(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { transaction } = await checkInToTransaction(
            transactionId,
            position.coords.latitude,
            position.coords.longitude,
          );
          setDetail((prev) => (prev ? { ...prev, transaction } : prev));
        } catch (err) {
          if (err instanceof ApiError && err.status === 422) {
            setCheckInError(
              "You're too far from the venue — check-in requires being within 500m",
            );
          } else if (err instanceof ApiError) {
            setCheckInError(err.message);
          } else {
            setCheckInError("Something went wrong. Please try again.");
          }
        } finally {
          setIsCheckingIn(false);
        }
      },
      (geoErr) => {
        setCheckInError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? "Enable location access to check in"
            : "Couldn't get your location. Please try again.",
        );
        setIsCheckingIn(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [transactionId]);

  function handleEmailFileChange(e: ChangeEvent<HTMLInputElement>) {
    setEmailFile(e.target.files?.[0] ?? null);
  }

  async function handleSubmitEmailForward() {
    if (!emailFile && !emailText.trim()) {
      setSubmitEmailError("Upload a file or paste the email text - at least one is required");
      return;
    }
    setSubmitEmailError(null);
    setIsSubmittingEmail(true);
    try {
      const { transaction } = await submitEmailForward(transactionId, {
        file: emailFile,
        text: emailText.trim() || undefined,
      });
      setDetail((prev) => (prev ? { ...prev, transaction } : prev));
      setEmailFile(null);
      setEmailText("");
    } catch (err) {
      setSubmitEmailError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmittingEmail(false);
    }
  }

  async function handleConfirmReceipt() {
    setConfirmError(null);
    setIsConfirming(true);
    try {
      const { transaction } = await confirmReceipt(transactionId);
      setDetail((prev) => (prev ? { ...prev, transaction } : prev));
    } catch (err) {
      setConfirmError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsConfirming(false);
    }
  }

  const title = detail?.party === "seller" ? "Your Sale" : "Your Ticket";

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center justify-between">
        <Link href="/" className="text-sm font-medium text-muted hover:text-foreground">
          ← Home
        </Link>
        <span className="font-display text-2xl tracking-wide text-gold">{title}</span>
      </header>

      <div className="mt-10 w-full max-w-sm flex-1">
        {detailError && (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="font-display text-xl tracking-wide text-error">Not available</p>
            <p className="mt-2 text-sm text-muted">{detailError}</p>
          </div>
        )}

        {!detailError && !detail && (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="font-display text-xl tracking-wide text-foreground">
              Confirming your payment...
            </p>
            <p className="mt-2 text-sm text-muted">
              This usually takes just a few seconds.
              {seats && amountPaid && ` ${seats} seat(s) · ₹${amountPaid}`}
            </p>
          </div>
        )}

        {!detailError && detail && detail.paymentMode === "contact_only" && (
          <ContactOnlyDetail transactionId={transactionId} detail={detail} />
        )}

        {!detailError &&
          detail &&
          detail.paymentMode === "escrow" &&
          detail.transaction.status === "RESERVED" && (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center">
              <p className="font-display text-xl tracking-wide text-foreground">
                Confirming your payment...
              </p>
              <p className="mt-2 text-sm text-muted">This usually takes just a few seconds.</p>
            </div>
          )}

        {!detailError && detail && detail.paymentMode === "escrow" && detail.transaction.status === "ESCROWED" && (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <p className="font-medium text-foreground">{detail.listing.movieName}</p>
              <p className="text-sm text-muted">
                {detail.listing.theaterName} · {formatShowtimeFull(detail.listing.showtime)}
              </p>
            </div>

            {detail.party === "buyer" && (
              <div className="rounded-2xl border border-line bg-surface p-6 text-center">
                <p className="font-display text-xl tracking-wide text-success">
                  Payment confirmed ✓
                </p>
                <p className="mt-2 text-sm text-muted">
                  Show this to the seller at the venue - it&apos;s your proof of purchase.
                </p>
                {screenshotState === "ready" &&
                  (screenshotUrl ? (
                    <div className="relative mt-4 h-64 w-full overflow-hidden rounded-lg border border-line bg-surface-raised">
                      <Image
                        src={screenshotUrl}
                        alt="Booking confirmation screenshot"
                        fill
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted">
                      No screenshot was uploaded for this listing.
                    </p>
                  ))}
                {screenshotState === "loading" && (
                  <p className="mt-4 text-sm text-muted">Loading screenshot...</p>
                )}
                {screenshotState === "error" && (
                  <p className="mt-4 text-sm text-error">Couldn&apos;t load the screenshot.</p>
                )}
              </div>
            )}

            {/* Seller check-in is only required for IN_PERSON - EMAIL_FORWARD
                skips it, so the seller's own view skips this section
                entirely rather than showing an optional/misleading step. */}
            {!(detail.party === "seller" && detail.transaction.deliveryMethod === "EMAIL_FORWARD") && (
              <CheckInSection
                party={detail.party}
                deliveryMethod={detail.transaction.deliveryMethod}
                showtime={detail.listing.showtime}
                buyerCheckInAt={detail.transaction.buyerCheckInAt}
                sellerCheckInAt={detail.transaction.sellerCheckInAt}
                isCheckingIn={isCheckingIn}
                checkInError={checkInError}
                onCheckIn={handleCheckIn}
              />
            )}

            {detail.transaction.deliveryMethod === "EMAIL_FORWARD" && (
              <EmailForwardSection
                party={detail.party}
                status={detail.transaction.status}
                submittedAt={detail.transaction.emailForwardSubmittedAt}
                emailForwardState={emailForwardState}
                emailForward={emailForward}
                emailFile={emailFile}
                emailText={emailText}
                onEmailFileChange={handleEmailFileChange}
                onEmailTextChange={setEmailText}
                onSubmit={handleSubmitEmailForward}
                isSubmitting={isSubmittingEmail}
                submitError={submitEmailError}
              />
            )}

            <ContactSection
              contact={contact}
              contactError={contactError}
              ready={confirmReceiptReady}
              transactionId={transactionId}
            />

            {detail.party === "buyer" && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <Button
                  onClick={handleConfirmReceipt}
                  isLoading={isConfirming}
                  disabled={!confirmReceiptReady}
                  title={confirmReceiptReady ? undefined : confirmReceiptHint(detail.transaction.deliveryMethod)}
                >
                  {isConfirming ? "Confirming..." : "Confirm receipt"}
                </Button>
                {!confirmReceiptReady && (
                  <p className="mt-2 text-center text-xs text-muted">
                    {confirmReceiptHint(detail.transaction.deliveryMethod)}
                  </p>
                )}
                <ErrorText>{confirmError}</ErrorText>
              </div>
            )}
          </div>
        )}

        {!detailError &&
          detail &&
          detail.paymentMode === "escrow" &&
          !["RESERVED", "ESCROWED"].includes(detail.transaction.status) && (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="font-display text-xl tracking-wide text-foreground">
              {detail.listing.movieName}
            </p>
            <p className="mt-1 text-sm text-muted">{detail.listing.theaterName}</p>
            <p className="mt-4 text-sm text-foreground">
              {describeOtherStatus(detail.transaction.status)}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// PAYMENT_MODE=contact_only's steady-state view: reservations in this mode
// never leave RESERVED and have no payment/check-in/confirm-receipt
// sequence at all - see the paymentMode-gated branches above, which skip
// all of that UI entirely for this mode. The buyer normally already saw
// this contact inline on the buy page right after reserving (see
// ContactReveal in app/buy/[listingId]/page.tsx); this is the durable,
// revisitable copy of it, fetched fresh via GET /:id/contact (unrestricted
// in this mode - no 30-minute showtime window to wait out).
function ContactOnlyDetail({
  transactionId,
  detail,
}: {
  transactionId: string;
  detail: TransactionDetail;
}) {
  const [contact, setContact] = useState<TransactionContact | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTransactionContact(transactionId)
      .then(({ contact }) => {
        if (!cancelled) setContact(contact);
      })
      .catch((err) => {
        if (cancelled) return;
        setContactError(
          err instanceof ApiError ? err.message : "Couldn't load contact details.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  const otherPartyLabel = detail.party === "buyer" ? "seller" : "buyer";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="font-medium text-foreground">{detail.listing.movieName}</p>
        <p className="text-sm text-muted">
          {detail.listing.theaterName} · {formatShowtimeFull(detail.listing.showtime)}
        </p>

        <p className="mt-4 text-sm text-muted">
          {detail.party === "buyer"
            ? "Contact the seller directly to arrange payment and pickup."
            : "The buyer's contact - they'll reach out to arrange payment and pickup."}
        </p>

        <div className="mt-4 rounded-lg border border-line bg-surface-raised p-4">
          {contact ? (
            <>
              <p className="text-sm font-medium text-foreground">
                {contact.name ?? `The ${otherPartyLabel}`}
              </p>
              {contact.ratingSummary && (
                <RatingSummaryBadge summary={contact.ratingSummary} className="mt-0.5 block" />
              )}
              <a
                href={`tel:${contact.phone}`}
                className="mt-1 block font-display text-lg tracking-wide text-gold hover:text-gold-dim"
              >
                {contact.phone}
              </a>
              {contact.hasWhatsapp && <WhatsAppButton phone={contact.phone} />}
            </>
          ) : contactError ? (
            <p className="text-sm text-error">{contactError}</p>
          ) : (
            <p className="text-sm text-muted">Loading contact details...</p>
          )}
        </div>

        {contact && (
          <ReportUserButton reportedPhone={contact.phone} relatedTransactionId={transactionId} />
        )}
      </div>

      {detail.party === "buyer" && (
        <div className="rounded-2xl border border-error/40 bg-error/10 p-4 text-sm text-error">
          {CONTACT_ONLY_DISCLAIMER}
        </div>
      )}
    </div>
  );
}

// Text shown near the disabled Confirm receipt button, and as its title
// tooltip - kept in one place so the two stay in sync with the backend's
// actual gate (see confirmReceiptReady above).
function confirmReceiptHint(deliveryMethod: DeliveryMethod): string {
  return deliveryMethod === "IN_PERSON"
    ? "Available once both you and the seller have checked in near the venue."
    : "Available once you've checked in near the venue and the seller has forwarded the booking email.";
}

function CheckInSection({
  party,
  deliveryMethod,
  showtime,
  buyerCheckInAt,
  sellerCheckInAt,
  isCheckingIn,
  checkInError,
  onCheckIn,
}: {
  party: "buyer" | "seller";
  deliveryMethod: DeliveryMethod;
  showtime: string;
  buyerCheckInAt: string | null;
  sellerCheckInAt: string | null;
  isCheckingIn: boolean;
  checkInError: string | null;
  onCheckIn: () => void;
}) {
  const myCheckInAt = party === "buyer" ? buyerCheckInAt : sellerCheckInAt;
  const otherCheckInAt = party === "buyer" ? sellerCheckInAt : buyerCheckInAt;
  // The seller's check-in isn't part of the EMAIL_FORWARD flow at all, so a
  // buyer viewing an EMAIL_FORWARD transaction shouldn't see a footer note
  // about waiting on it - the EmailForwardSection below covers the
  // seller's side of that delivery method instead.
  const otherPartyCheckInRelevant = deliveryMethod === "IN_PERSON";
  const { state, opensAt } = getCheckInWindow(showtime);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-display text-lg tracking-wide text-foreground">Check in at the venue</p>

      {myCheckInAt ? (
        <p className="mt-2 text-sm text-success">You&apos;ve checked in ✓</p>
      ) : state === "before" ? (
        <p className="mt-2 text-sm text-muted">Check-in opens at {formatTimeOnly(opensAt)}</p>
      ) : state === "closed" ? (
        <p className="mt-2 text-sm text-muted">Check-in window has closed</p>
      ) : (
        <div className="mt-2">
          <Button onClick={onCheckIn} isLoading={isCheckingIn}>
            {isCheckingIn ? "Checking in..." : "Check in now"}
          </Button>
          <ErrorText>{checkInError}</ErrorText>
        </div>
      )}

      {otherPartyCheckInRelevant && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          {otherCheckInAt
            ? `The ${party === "buyer" ? "seller" : "buyer"} has checked in.`
            : `Waiting for the ${party === "buyer" ? "seller" : "buyer"} to check in.`}
        </p>
      )}
    </div>
  );
}

function EmailForwardSection({
  party,
  status,
  submittedAt,
  emailForwardState,
  emailForward,
  emailFile,
  emailText,
  onEmailFileChange,
  onEmailTextChange,
  onSubmit,
  isSubmitting,
  submitError,
}: {
  party: "buyer" | "seller";
  status: TransactionDetail["transaction"]["status"];
  submittedAt: string | null;
  emailForwardState: ScreenshotState;
  emailForward: TransactionEmailForward | null;
  emailFile: File | null;
  emailText: string;
  onEmailFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onEmailTextChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}) {
  if (party === "seller") {
    // Matches the backend's own gate (POST /:id/email-forward requires
    // ESCROWED) - resubmission while still ESCROWED is allowed (e.g. to fix
    // a mistake), so the form stays visible even after a first submission.
    if (status !== "ESCROWED") return null;

    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="font-display text-lg tracking-wide text-foreground">
          Forward the booking email
        </p>
        <p className="mt-1 text-xs text-muted">
          Upload the original booking confirmation email (or paste its text) so the buyer can use
          it at the venue. This unblocks their confirm receipt step.
        </p>

        {submittedAt && (
          <p className="mt-2 text-sm text-success">Submitted ✓ - you can resend to update it.</p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <input
            type="file"
            onChange={onEmailFileChange}
            className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#1a1408]"
          />
          {emailFile && <p className="text-xs text-muted">Selected: {emailFile.name}</p>}
          <textarea
            value={emailText}
            onChange={(e) => onEmailTextChange(e.target.value)}
            placeholder="Or paste the email text here"
            rows={4}
            className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
        </div>

        <div className="mt-3">
          <Button onClick={onSubmit} isLoading={isSubmitting}>
            {isSubmitting ? "Sending..." : submittedAt ? "Resend" : "Send to buyer"}
          </Button>
          <ErrorText>{submitError}</ErrorText>
        </div>
      </div>
    );
  }

  // Buyer's view.
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-display text-lg tracking-wide text-foreground">
        Booking confirmation email
      </p>

      {!submittedAt && (
        <p className="mt-2 text-sm text-muted">Waiting for the seller to forward the email.</p>
      )}

      {submittedAt && emailForwardState === "loading" && (
        <p className="mt-2 text-sm text-muted">Loading...</p>
      )}
      {submittedAt && emailForwardState === "error" && (
        <p className="mt-2 text-sm text-error">Couldn&apos;t load the forwarded email.</p>
      )}
      {submittedAt && emailForwardState === "ready" && emailForward && (
        <div className="mt-2 flex flex-col gap-2">
          {emailForward.fileUrl && (
            <a
              href={emailForward.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gold hover:text-gold-dim"
            >
              View forwarded file →
            </a>
          )}
          {emailForward.text && (
            <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface-raised p-3 text-sm text-foreground">
              {emailForward.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ContactSection({
  contact,
  contactError,
  ready,
  transactionId,
}: {
  contact: TransactionContact | null;
  contactError: string | null;
  ready: boolean;
  transactionId: string;
}) {
  if (!ready) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-display text-lg tracking-wide text-foreground">Contact</p>
      {contact && (
        <div className="mt-2 text-sm">
          <p className="text-foreground">{contact.name ?? "The other party"}</p>
          {contact.ratingSummary && (
            <RatingSummaryBadge summary={contact.ratingSummary} className="mt-0.5 block" />
          )}
          <a href={`tel:${contact.phone}`} className="text-gold hover:text-gold-dim">
            {contact.phone}
          </a>
          {contact.hasWhatsapp && <WhatsAppButton phone={contact.phone} />}
          <ReportUserButton reportedPhone={contact.phone} relatedTransactionId={transactionId} />
        </div>
      )}
      {!contact && contactError && <p className="mt-2 text-sm text-muted">{contactError}</p>}
      {!contact && !contactError && (
        <p className="mt-2 text-sm text-muted">Loading contact details...</p>
      )}
    </div>
  );
}

export default function TransactionDetailPage() {
  return (
    <Suspense fallback={null}>
      <TransactionDetailContent />
    </Suspense>
  );
}
