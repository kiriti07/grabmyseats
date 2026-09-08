"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LIVE_LISTING_STATUSES, type MyListing } from "@grabmyseats/shared";
import { formatShowtimeFull } from "@/lib/format";
import { sortMyListingsByAttention } from "@/lib/listingSort";
import { describeTransactionState } from "@/lib/transactionState";
import { datetimeLocalValueToIso, isoToDatetimeLocalValue } from "@/lib/datetimeLocal";
import { INPUT_CLASS } from "@/lib/styles";
import {
  ApiError,
  deactivateListing,
  fetchMyListings,
  markListingSold,
  updateListing,
} from "@/lib/api";
import { ListingStatusBadge } from "@/components/sell/ListingStatusBadge";
import { QuantityStepper } from "@/components/buy/QuantityStepper";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { CategoryBadge } from "@/components/ui/CategoryBadge";

type ActionKind = "sold" | "deactivate" | "edit";

export default function MyListingsPage() {
  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only one listing's action panel is ever open at a time - keyed by
  // listing id + which action, rather than per-card state, so opening a
  // new one always closes whatever else was open.
  const [activeAction, setActiveAction] = useState<{ listingId: string; kind: ActionKind } | null>(
    null,
  );
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [soldSeats, setSoldSeats] = useState(1);
  const [editPricePerSeat, setEditPricePerSeat] = useState("");
  const [editShowtime, setEditShowtime] = useState("");
  const [editTotalSeats, setEditTotalSeats] = useState("");

  useEffect(() => {
    fetchMyListings()
      .then(({ listings }) => setListings(sortMyListingsByAttention(listings)))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Couldn't load your listings.");
      });
  }, []);

  // Applies a server-confirmed change in place, re-sorting afterward since
  // a status change can move a card's attention rank - no full refetch
  // needed, the mutating endpoints already return the authoritative row.
  function patchListing(id: string, patch: Partial<MyListing>) {
    setListings((prev) =>
      prev ? sortMyListingsByAttention(prev.map((l) => (l.id === id ? { ...l, ...patch } : l))) : prev,
    );
  }

  function openAction(listing: MyListing, kind: ActionKind) {
    setActionError(null);
    if (kind === "sold") setSoldSeats(listing.availableSeats);
    if (kind === "edit") {
      setEditPricePerSeat(String(listing.pricePerSeat));
      setEditShowtime(isoToDatetimeLocalValue(listing.showtime));
      setEditTotalSeats(String(listing.totalSeats));
    }
    setActiveAction({ listingId: listing.id, kind });
  }

  function closeAction() {
    setActiveAction(null);
    setActionError(null);
  }

  async function handleConfirmMarkSold(listing: MyListing) {
    setIsSubmittingAction(true);
    setActionError(null);
    try {
      const { listing: updated } = await markListingSold(listing.id, soldSeats);
      patchListing(listing.id, {
        status: updated.status,
        availableSeats: updated.availableSeats,
        seatsSold: updated.totalSeats - updated.availableSeats,
      });
      closeAction();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmittingAction(false);
    }
  }

  async function handleConfirmDeactivate(listing: MyListing) {
    setIsSubmittingAction(true);
    setActionError(null);
    try {
      const { listing: updated } = await deactivateListing(listing.id);
      patchListing(listing.id, { status: updated.status });
      closeAction();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmittingAction(false);
    }
  }

  async function handleSaveEdit(listing: MyListing) {
    setActionError(null);

    const price = Number(editPricePerSeat);
    if (!(price > 0)) {
      setActionError("Price per seat must be greater than 0");
      return;
    }
    if (!editShowtime) {
      setActionError("Pick a showtime");
      return;
    }
    const showtimeIso = datetimeLocalValueToIso(editShowtime);
    if (new Date(showtimeIso).getTime() <= Date.now()) {
      setActionError("Showtime must be in the future");
      return;
    }

    // Seat count is only ever sent when it's actually editable (nothing
    // reserved/sold yet) - sending it otherwise would 409 server-side even
    // if the value is unchanged, since the backend can't tell "unchanged"
    // from "trying to sneak past the guard" apart from just refusing it
    // whenever it's present at all on a partially-sold listing.
    const seatsEditable = listing.availableSeats === listing.totalSeats;
    let seats: number | undefined;
    if (seatsEditable) {
      seats = Number(editTotalSeats);
      if (!Number.isInteger(seats) || seats < 1) {
        setActionError("Total seats must be a whole number of at least 1");
        return;
      }
    }

    setIsSubmittingAction(true);
    try {
      const { listing: updated } = await updateListing(listing.id, {
        pricePerSeat: price,
        showtime: showtimeIso,
        ...(seatsEditable ? { totalSeats: seats } : {}),
      });
      patchListing(listing.id, {
        pricePerSeat: updated.pricePerSeat,
        showtime: updated.showtime,
        totalSeats: updated.totalSeats,
        availableSeats: updated.availableSeats,
        seatsSold: updated.totalSeats - updated.availableSeats,
      });
      closeAction();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmittingAction(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center justify-between">
        <Link href="/sell" className="text-sm font-medium text-muted hover:text-foreground">
          ← Sell
        </Link>
        <span className="font-display text-2xl tracking-wide text-gold">My Listings</span>
      </header>

      <div className="mt-6 w-full max-w-sm flex-1">
        {error && <p className="text-center text-sm text-error">{error}</p>}
        {!error && listings === null && (
          <p className="text-center text-sm text-muted">Loading...</p>
        )}
        {!error && listings !== null && listings.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted">You haven&apos;t listed any tickets yet.</p>
            <Link
              href="/sell"
              className="rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-[#1a1408] hover:bg-gold-dim"
            >
              List tickets
            </Link>
          </div>
        )}

        {listings && listings.length > 0 && (
          <ul className="flex flex-col gap-3">
            {listings.map((listing) => {
              const txnStates = listing.transactions
                .map((txn) => ({ txn, text: describeTransactionState(txn) }))
                .filter((entry): entry is { txn: (typeof listing.transactions)[number]; text: string } =>
                  entry.text !== null,
                );
              const isLive = LIVE_LISTING_STATUSES.includes(listing.status);
              const isActive = activeAction?.listingId === listing.id;

              return (
                <li key={listing.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{listing.movieName}</p>
                      <p className="text-sm text-muted">{listing.theaterName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <ListingStatusBadge status={listing.status} />
                      <CategoryBadge category={listing.category} />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-muted">
                    <span>{formatShowtimeFull(listing.showtime)}</span>
                    <span>
                      {listing.seatsSold} of {listing.totalSeats} seats sold
                    </span>
                  </div>

                  {txnStates.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-2">
                      {txnStates.map(({ txn, text }) => (
                        <Link
                          key={txn.id}
                          href={`/transactions/${txn.id}`}
                          className="flex items-center justify-between gap-3 text-xs hover:text-gold"
                        >
                          <span className="text-muted">
                            {txn.seatsCount} seat{txn.seatsCount === 1 ? "" : "s"}
                          </span>
                          <span className="text-right font-medium text-foreground">{text}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {isLive && (
                    <div className="mt-3 border-t border-line pt-2.5">
                      {!isActive && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <button
                            type="button"
                            onClick={() => openAction(listing, "sold")}
                            className="text-xs font-medium text-gold hover:text-gold-dim"
                          >
                            Mark as sold
                          </button>
                          <button
                            type="button"
                            onClick={() => openAction(listing, "edit")}
                            className="text-xs font-medium text-muted hover:text-foreground"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openAction(listing, "deactivate")}
                            className="text-xs font-medium text-muted hover:text-error"
                          >
                            Deactivate
                          </button>
                        </div>
                      )}

                      {isActive && activeAction?.kind === "sold" && (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-xs text-muted">How many seats did you sell?</p>
                          <QuantityStepper
                            value={soldSeats}
                            max={listing.availableSeats}
                            onChange={setSoldSeats}
                            disabled={isSubmittingAction}
                          />
                          <p className="text-center text-xs text-muted">
                            This can&apos;t be undone - {soldSeats} of {listing.availableSeats}{" "}
                            remaining seat{listing.availableSeats === 1 ? "" : "s"} will be marked
                            sold.
                          </p>
                          <ErrorText>{actionError}</ErrorText>
                          <div className="flex w-full gap-2">
                            <button
                              type="button"
                              onClick={closeAction}
                              disabled={isSubmittingAction}
                              className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-foreground hover:border-gold disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <div className="flex-1">
                              <Button
                                onClick={() => handleConfirmMarkSold(listing)}
                                isLoading={isSubmittingAction}
                              >
                                Confirm
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {isActive && activeAction?.kind === "deactivate" && (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-center text-xs text-muted">
                            This pulls the listing down without marking any seats sold. It can&apos;t
                            be undone.
                          </p>
                          <ErrorText>{actionError}</ErrorText>
                          <div className="flex w-full gap-2">
                            <button
                              type="button"
                              onClick={closeAction}
                              disabled={isSubmittingAction}
                              className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-foreground hover:border-gold disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmDeactivate(listing)}
                              disabled={isSubmittingAction}
                              className="flex-1 rounded-lg bg-error px-3 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60"
                            >
                              {isSubmittingAction ? "Deactivating..." : "Confirm"}
                            </button>
                          </div>
                        </div>
                      )}

                      {isActive && activeAction?.kind === "edit" && (
                        <div className="flex flex-col gap-3">
                          <div>
                            <label
                              htmlFor={`price-${listing.id}`}
                              className="mb-1 block text-xs font-medium text-foreground"
                            >
                              Price per seat (₹)
                            </label>
                            <input
                              id={`price-${listing.id}`}
                              type="number"
                              min={1}
                              step={1}
                              value={editPricePerSeat}
                              onChange={(e) => setEditPricePerSeat(e.target.value)}
                              className={INPUT_CLASS}
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`showtime-${listing.id}`}
                              className="mb-1 block text-xs font-medium text-foreground"
                            >
                              Showtime
                            </label>
                            <input
                              id={`showtime-${listing.id}`}
                              type="datetime-local"
                              value={editShowtime}
                              onChange={(e) => setEditShowtime(e.target.value)}
                              className={INPUT_CLASS}
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`seats-${listing.id}`}
                              className="mb-1 block text-xs font-medium text-foreground"
                            >
                              Total seats
                            </label>
                            <input
                              id={`seats-${listing.id}`}
                              type="number"
                              min={1}
                              step={1}
                              value={editTotalSeats}
                              onChange={(e) => setEditTotalSeats(e.target.value)}
                              disabled={listing.availableSeats !== listing.totalSeats}
                              className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                            />
                            {listing.availableSeats !== listing.totalSeats && (
                              <p className="mt-1 text-xs text-muted">
                                Seat count is locked once any seats are reserved or sold.
                              </p>
                            )}
                          </div>

                          <ErrorText>{actionError}</ErrorText>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={closeAction}
                              disabled={isSubmittingAction}
                              className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-foreground hover:border-gold disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <div className="flex-1">
                              <Button
                                onClick={() => handleSaveEdit(listing)}
                                isLoading={isSubmittingAction}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
