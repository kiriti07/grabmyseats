"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { DeliveryMethod, ListingDetail, TransactionContact } from "@grabmyseats/shared";
import { QuantityStepper } from "@/components/buy/QuantityStepper";
import { DeliveryMethodPicker } from "@/components/buy/DeliveryMethodPicker";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { RatingSummaryBadge } from "@/components/ui/RatingSummaryBadge";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { ReportUserButton } from "@/components/report/ReportUserButton";
import { formatShowtimeFull } from "@/lib/format";
import { CONTACT_ONLY_DISCLAIMER } from "@/lib/paymentMode";
import { ApiError, getListing, reserveListing } from "@/lib/api";

function ListingDetailContent() {
  const { listingId } = useParams<{ listingId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const coords = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [seats, setSeats] = useState(1);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  // Set only in PAYMENT_MODE=contact_only, once reserve succeeds - the
  // reveal happens right here inline (not a navigation to a payment
  // screen), per the contact_only flow's whole point of skipping escrow.
  const [revealedContact, setRevealedContact] = useState<{
    transactionId: string;
    contact: TransactionContact;
  } | null>(null);

  useEffect(() => {
    setIsLoading(true);
    getListing(listingId, coords)
      .then(({ listing }) => {
        setListing(listing);
        setSeats(1);
        setDeliveryMethod(listing.availableDeliveryMethods[0] ?? null);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load this listing.");
      })
      .finally(() => setIsLoading(false));
    // Only re-fetch on listingId change - lat/lng are a fixed origin
    // carried over from the search page, not something that should
    // re-trigger a fetch as the user adjusts the seat count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  async function handleReserve() {
    const isContactOnly = listing?.paymentMode === "contact_only";
    if (!isContactOnly && !deliveryMethod) {
      setReserveError("Pick a delivery method before reserving");
      return;
    }
    setReserveError(null);
    setIsReserving(true);
    try {
      const { transaction, contact } = await reserveListing(
        listingId,
        seats,
        isContactOnly ? undefined : deliveryMethod!,
      );
      if (isContactOnly && contact) {
        setRevealedContact({ transactionId: transaction.id, contact });
        setIsReserving(false);
        return;
      }
      const params = new URLSearchParams({
        transactionId: transaction.id,
        seats: String(transaction.seatsCount),
        amountPaid: String(transaction.amountPaid),
        expiresAt: transaction.reservationExpiresAt ?? "",
      });
      router.push(`/buy/${listingId}/pay?${params.toString()}`);
    } catch (err) {
      setReserveError(
        err instanceof ApiError ? err.message : "Couldn't reserve those seats. Please try again.",
      );
      setIsReserving(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center">
        <Link href="/buy" className="text-sm font-medium text-muted hover:text-foreground">
          ← Buy
        </Link>
      </header>

      <div className="w-full max-w-sm flex-1 pt-6">
        {isLoading && <p className="text-center text-sm text-muted">Loading...</p>}
        {!isLoading && loadError && <p className="text-center text-sm text-error">{loadError}</p>}

        {!isLoading && listing && (
          <>
            {/* The booking screenshot (QR code + booking ID) is never shown
                pre-purchase - it's the buyer's proof-of-purchase, only
                available post-escrow via /transactions/[transactionId]. */}
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-2xl tracking-wide text-foreground">
                {listing.movieName}
              </h1>
              <CategoryBadge category={listing.category} />
            </div>
            <p className="mt-1 text-muted">{listing.theaterName}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              Seller: <RatingSummaryBadge summary={listing.sellerRatingSummary} />
            </p>
            <p className="mt-1 text-xs text-muted">
              {listing.viewCount} view{listing.viewCount === 1 ? "" : "s"} ·{" "}
              {listing.contactCount} contacted
            </p>

            <dl className="mt-4 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Showtime</dt>
                <dd className="text-foreground">{formatShowtimeFull(listing.showtime)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Seats available</dt>
                <dd className="text-foreground">{listing.availableSeats}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Price per seat</dt>
                <dd className="text-gold">₹{listing.pricePerSeat}</dd>
              </div>
              {listing.distanceKm !== null && (
                <div className="flex justify-between">
                  <dt className="text-muted">Distance</dt>
                  <dd className="text-foreground">{listing.distanceKm.toFixed(1)} km</dd>
                </div>
              )}
            </dl>

            {revealedContact ? (
              <ContactReveal
                contact={revealedContact.contact}
                transactionId={revealedContact.transactionId}
              />
            ) : listing.availableSeats > 0 ? (
              <div className="mt-8 rounded-2xl border border-line bg-surface p-5 text-center">
                <p className="mb-4 text-sm font-medium text-foreground">
                  {listing.paymentMode === "contact_only" ? "Get in touch" : "Reserve seats"}
                </p>
                <QuantityStepper
                  value={seats}
                  max={listing.availableSeats}
                  onChange={setSeats}
                  disabled={isReserving}
                />

                {listing.paymentMode === "escrow" && (
                  <DeliveryMethodPicker
                    availableDeliveryMethods={listing.availableDeliveryMethods}
                    value={deliveryMethod}
                    onChange={setDeliveryMethod}
                    disabled={isReserving}
                  />
                )}

                <p className="mt-4 font-display text-xl tracking-wide text-gold">
                  ₹{seats * listing.pricePerSeat}
                </p>
                <ErrorText>{reserveError}</ErrorText>
                <div className="mt-4">
                  <Button onClick={handleReserve} isLoading={isReserving}>
                    {isReserving
                      ? listing.paymentMode === "contact_only"
                        ? "Getting contact info..."
                        : "Reserving..."
                      : listing.paymentMode === "contact_only"
                        ? "Get seller's contact info"
                        : "Reserve seats"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-8 text-center text-sm text-muted">
                This listing is sold out.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// PAYMENT_MODE=contact_only's whole reveal moment: the seller's contact,
// with the disclaimer right alongside it so it can't be missed or scrolled
// past separately. "View details" links to the transaction detail page
// (also contact_only-aware - see that page) purely so this info has a
// durable place to be found again later, not because anything further
// happens there in this mode.
function ContactReveal({
  contact,
  transactionId,
}: {
  contact: TransactionContact;
  transactionId: string;
}) {
  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-surface p-5 text-center">
        <p className="font-display text-xl tracking-wide text-success">Seats held ✓</p>
        <p className="mt-2 text-sm text-muted">
          Contact the seller directly to arrange payment and pickup.
        </p>
        <div className="mt-4 rounded-lg border border-line bg-surface-raised p-4">
          <p className="text-sm font-medium text-foreground">{contact.name ?? "The seller"}</p>
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
        </div>
        <Link
          href={`/transactions/${transactionId}`}
          className="mt-4 inline-block text-sm font-medium text-gold hover:text-gold-dim"
        >
          View details →
        </Link>

        <ReportUserButton reportedPhone={contact.phone} relatedTransactionId={transactionId} />
      </div>

      <div className="rounded-2xl border border-error/40 bg-error/10 p-4 text-sm text-error">
        {CONTACT_ONLY_DISCLAIMER}
      </div>
    </div>
  );
}

export default function ListingDetailPage() {
  return (
    <Suspense fallback={null}>
      <ListingDetailContent />
    </Suspense>
  );
}
