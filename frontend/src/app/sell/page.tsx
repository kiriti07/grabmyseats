"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  INDIAN_METRO_CITIES,
  type Category,
  type DeliveryMethod,
  type Listing,
  type SellerDeliveryEligibility,
} from "@grabmyseats/shared";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { AutoFilledBadge } from "@/components/sell/AutoFilledBadge";
import { INPUT_CLASS } from "@/lib/styles";
import { formatShowtimeFull } from "@/lib/format";
import { datetimeLocalValueToIso, isoToDatetimeLocalValue } from "@/lib/datetimeLocal";
import { DELIVERY_METHOD_DESCRIPTION, DELIVERY_METHOD_LABEL } from "@/lib/deliveryMethod";
import { CATEGORY_LABEL, titleFieldLabel, venueFieldLabel } from "@/lib/category";
import { ApiError, createListing, fetchDeliveryEligibility, geocodeVenue, runOcr } from "@/lib/api";
import { getVenuePickerCityCenter } from "@/lib/venuePickerCityCenters";

const ALL_CATEGORIES: Category[] = ["MOVIE", "EVENT", "SPORT"];

// Leaflet touches `window` at import time, so it can never run during SSR.
const VenuePicker = dynamic(
  () => import("@/components/sell/VenuePicker").then((m) => m.VenuePicker),
  { ssr: false },
);

const VENUE_GEOCODE_DEBOUNCE_MS = 700;
type VenueStatus = "idle" | "checking" | "resolved" | "failed";

// Matches MAX_FILE_SIZE_BYTES in backend/src/middleware/upload.ts - caught
// here too so a seller finds out before waiting on an upload that the
// server will reject anyway.
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

type AutoFillableField =
  | "movieName"
  | "theaterName"
  | "showtime"
  | "totalSeats"
  | "pricePerSeat"
  | "bookingId";

export default function SellPage() {
  const [category, setCategory] = useState<Category>("MOVIE");
  const [movieName, setMovieName] = useState("");
  const [theaterName, setTheaterName] = useState("");
  const [city, setCity] = useState("");
  const [showtime, setShowtime] = useState("");
  const [totalSeats, setTotalSeats] = useState("1");
  const [pricePerSeat, setPricePerSeat] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);

  const [autoFilled, setAutoFilled] = useState<Partial<Record<AutoFillableField, boolean>>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [skipOcr, setSkipOcr] = useState(false);
  // A ref (not just the `skipOcr` state) because handleFileChange's OCR
  // request can still be in flight when the seller clicks "skip" - the
  // in-progress `await runOcr(...)` closes over state from render time, so
  // only a ref mutated synchronously in the click handler is guaranteed to
  // be seen when that request resolves.
  const skipOcrRef = useRef(false);

  // Resolved venue location, confirmed either automatically (geocoding
  // succeeded) or by the seller via VenuePicker below. Submission is
  // blocked until this is set - never silently falls back to unconfirmed
  // coordinates.
  const [venueStatus, setVenueStatus] = useState<VenueStatus>("idle");
  const [venueCoords, setVenueCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [venueLabel, setVenueLabel] = useState<string | null>(null);
  const [venueCleanedName, setVenueCleanedName] = useState("");

  const [availableDeliveryMethods, setAvailableDeliveryMethods] = useState<DeliveryMethod[]>([
    "IN_PERSON",
  ]);
  const [eligibility, setEligibility] = useState<SellerDeliveryEligibility | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdListing, setCreatedListing] = useState<Listing | null>(null);

  // Failing to load eligibility shouldn't block listing at all - it just
  // means the EMAIL_FORWARD checkbox stays hidden (same as "not eligible").
  useEffect(() => {
    fetchDeliveryEligibility()
      .then(setEligibility)
      .catch(() => setEligibility(null));
  }, []);

  function toggleDeliveryMethod(method: DeliveryMethod) {
    setAvailableDeliveryMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
  }

  useEffect(() => {
    if (!theaterName.trim() || !city) {
      setVenueStatus("idle");
      setVenueCoords(null);
      setVenueLabel(null);
      return;
    }

    setVenueStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const preview = await geocodeVenue(theaterName, city);
        setVenueCleanedName(preview.cleanedName);
        if (preview.found && preview.lat !== null && preview.lng !== null) {
          setVenueCoords({ lat: preview.lat, lng: preview.lng });
          setVenueLabel(preview.displayName);
          setVenueStatus("resolved");
        } else {
          setVenueCoords(null);
          setVenueLabel(null);
          setVenueStatus("failed");
        }
      } catch {
        setVenueCleanedName(theaterName);
        setVenueCoords(null);
        setVenueLabel(null);
        setVenueStatus("failed");
      }
    }, VENUE_GEOCODE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [theaterName, city]);

  // Wraps a field's setter so editing an auto-filled value clears its
  // "auto-filled, please verify" badge - the badge should only ever
  // describe a value the seller hasn't looked at yet.
  function edited(field: AutoFillableField, setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setAutoFilled((prev) => (prev[field] ? { ...prev, [field]: false } : prev));
    };
  }

  function handleSkipOcr() {
    skipOcrRef.current = true;
    setSkipOcr(true);
    setIsScanning(false);
    setScanNotice(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setQrData(null);
    setScanNotice(null);
    if (file && !file.type.startsWith("image/")) {
      setError("Screenshot must be an image file");
      setScreenshot(null);
      return;
    }
    if (file && file.size > MAX_SCREENSHOT_BYTES) {
      setError("Screenshot must be smaller than 8MB");
      setScreenshot(null);
      return;
    }
    setError(null);
    setScreenshot(file);
    if (!file || skipOcrRef.current) return;

    setIsScanning(true);
    try {
      const { fields, qrData } = await runOcr(file, category);
      if (skipOcrRef.current) return;
      setQrData(qrData);

      // Only ever fill a currently-empty field - never overwrite something
      // the seller already typed, even if they typed it before picking a
      // file.
      const nextAutoFilled: Partial<Record<AutoFillableField, boolean>> = {};
      if (fields.movieName && !movieName.trim()) {
        setMovieName(fields.movieName);
        nextAutoFilled.movieName = true;
      }
      if (fields.theaterName && !theaterName.trim()) {
        setTheaterName(fields.theaterName);
        nextAutoFilled.theaterName = true;
      }
      if (fields.showtime && !showtime) {
        setShowtime(isoToDatetimeLocalValue(fields.showtime));
        nextAutoFilled.showtime = true;
      }
      if (fields.totalSeats && totalSeats === "1") {
        setTotalSeats(String(fields.totalSeats));
        nextAutoFilled.totalSeats = true;
      }
      if (fields.pricePerSeat && !pricePerSeat) {
        setPricePerSeat(String(fields.pricePerSeat));
        nextAutoFilled.pricePerSeat = true;
      }
      if (fields.bookingId && !bookingId.trim()) {
        setBookingId(fields.bookingId);
        nextAutoFilled.bookingId = true;
      }
      setAutoFilled(nextAutoFilled);

      if (Object.keys(nextAutoFilled).length === 0) {
        setScanNotice("Couldn't confidently read any details from this screenshot - fill them in below.");
      }
    } catch {
      if (!skipOcrRef.current) {
        setScanNotice("Couldn't auto-read this screenshot - fill in the details manually.");
      }
    } finally {
      if (!skipOcrRef.current) setIsScanning(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const seats = Number(totalSeats);
    const price = Number(pricePerSeat);

    if (!movieName.trim() || !theaterName.trim() || !city || !bookingId.trim()) {
      setError("Please fill in every field");
      return;
    }
    if (!showtime) {
      setError("Pick a showtime");
      return;
    }
    if (!Number.isInteger(seats) || seats < 1) {
      setError("Total seats must be a whole number of at least 1");
      return;
    }
    if (!(price > 0)) {
      setError("Price per seat must be greater than 0");
      return;
    }
    if (!screenshot) {
      setError("Upload a screenshot of your booking confirmation");
      return;
    }
    if (!venueCoords) {
      setError("Confirm the venue location before listing");
      return;
    }
    if (availableDeliveryMethods.length === 0) {
      setError("Pick at least one delivery method");
      return;
    }

    const formData = new FormData();
    formData.append("category", category);
    formData.append("availableDeliveryMethods", JSON.stringify(availableDeliveryMethods));
    formData.append("movieName", movieName.trim());
    formData.append("theaterName", theaterName.trim());
    formData.append("city", city);
    formData.append("bookingId", bookingId.trim());
    formData.append("totalSeats", String(seats));
    formData.append("pricePerSeat", String(price));
    formData.append("showtime", datetimeLocalValueToIso(showtime));
    formData.append("screenshot", screenshot);
    formData.append("theaterLat", String(venueCoords.lat));
    formData.append("theaterLng", String(venueCoords.lng));
    if (qrData) formData.append("qrData", qrData);

    setIsSubmitting(true);
    try {
      const { listing } = await createListing(formData);
      setCreatedListing(listing);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdListing) {
    return (
      <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
        <div className="mt-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="font-display text-2xl tracking-wide text-success">Listed!</p>
          <p className="mt-2 text-sm text-muted">Your seats are now visible to nearby buyers.</p>

          <dl className="mt-5 flex flex-col gap-1.5 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{titleFieldLabel(createdListing.category)}</dt>
              <dd className="text-foreground">{createdListing.movieName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{venueFieldLabel(createdListing.category)}</dt>
              <dd className="text-foreground">{createdListing.theaterName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Showtime</dt>
              <dd className="text-foreground">{formatShowtimeFull(createdListing.showtime)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Seats</dt>
              <dd className="text-foreground">{createdListing.totalSeats}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Price per seat</dt>
              <dd className="text-gold">₹{createdListing.pricePerSeat}</dd>
            </div>
          </dl>

          <div className="mt-6">
            <Link
              href="/sell/my-listings"
              className="text-sm font-medium text-gold hover:text-gold-dim"
            >
              View my listings →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center justify-between">
        <Link href="/" className="text-sm font-medium text-muted hover:text-foreground">
          ← Home
        </Link>
        <span className="font-display text-2xl tracking-wide text-gold">Sell Tickets</span>
      </header>

      <div className="mt-2 flex w-full max-w-sm justify-end">
        <Link
          href="/sell/my-listings"
          className="text-sm font-medium text-gold hover:text-gold-dim"
        >
          My Listings →
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex w-full max-w-sm flex-col gap-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-foreground">Category</legend>
          <div className="grid grid-cols-3 gap-2">
            {ALL_CATEGORIES.map((c) => (
              <label
                key={c}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${
                  category === c
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-line bg-surface text-foreground hover:border-gold/50"
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value={c}
                  checked={category === c}
                  onChange={() => setCategory(c)}
                  className="sr-only"
                />
                {CATEGORY_LABEL[c]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="screenshot" className="block text-sm font-medium text-foreground">
              Booking confirmation screenshot
            </label>
            {!skipOcr && (
              <button
                type="button"
                onClick={handleSkipOcr}
                className="shrink-0 text-xs font-semibold text-gold underline underline-offset-2 hover:text-gold-dim"
              >
                Skip auto-fill, enter manually
              </button>
            )}
          </div>
          <input
            id="screenshot"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#1a1408]"
          />
          <p className="mt-1.5 text-xs text-muted">
            {isScanning
              ? "Scanning screenshot for details..."
              : skipOcr
                ? "Auto-fill skipped - fill in the details below yourself."
                : scanNotice ??
                  (category === "MOVIE"
                    ? "We'll try to auto-fill the fields below from your screenshot."
                    : "We'll scan for a QR code, but you'll need to fill in the details below yourself.")}
          </p>
        </div>

        <div>
          <label htmlFor="movieName" className="mb-1.5 flex items-center text-sm font-medium text-foreground">
            {titleFieldLabel(category)}
            {autoFilled.movieName && <AutoFilledBadge />}
          </label>
          <input
            id="movieName"
            value={movieName}
            onChange={(e) => edited("movieName", setMovieName)(e.target.value)}
            placeholder={category === "MOVIE" ? "Jawan" : category === "EVENT" ? "Arijit Singh Live" : "India vs Australia, T20"}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="theaterName" className="mb-1.5 flex items-center text-sm font-medium text-foreground">
            {venueFieldLabel(category)}
            {autoFilled.theaterName && <AutoFilledBadge />}
          </label>
          <input
            id="theaterName"
            value={theaterName}
            onChange={(e) => edited("theaterName", setTheaterName)(e.target.value)}
            placeholder={category === "MOVIE" ? "PVR Phoenix Market City" : "M. Chinnaswamy Stadium"}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="city" className="mb-1.5 block text-sm font-medium text-foreground">
            City
          </label>
          <select
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="" disabled>
              Select city
            </option>
            {INDIAN_METRO_CITIES.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Used to help us locate the theater - not shown to buyers.
          </p>
        </div>

        {venueStatus === "checking" && (
          <p className="-mt-2 text-xs text-muted">Locating venue...</p>
        )}
        {venueStatus === "resolved" && (
          <p className="-mt-2 text-xs text-success">Located: {venueLabel} ✓</p>
        )}
        {venueStatus === "failed" && (
          <VenuePicker
            initialQuery={venueCleanedName || theaterName}
            city={city}
            cityCenter={getVenuePickerCityCenter(city)}
            onConfirm={(coords, label) => {
              setVenueCoords(coords);
              setVenueLabel(label);
              setVenueStatus("resolved");
            }}
          />
        )}

        <div>
          <label htmlFor="showtime" className="mb-1.5 flex items-center text-sm font-medium text-foreground">
            Showtime
            {autoFilled.showtime && <AutoFilledBadge />}
          </label>
          <input
            id="showtime"
            type="datetime-local"
            value={showtime}
            onChange={(e) => edited("showtime", setShowtime)(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {/* Labels and inputs are each their own row (rather than a label
            immediately above its own input, nested inside a shared
            flex-1 column) so that one label wrapping to two lines - e.g.
            "Seats" plus AutoFilledBadge on a narrow screen - grows the
            label row alone. The input row starts fresh below it, so both
            inputs always line up regardless of which label(s) wrapped. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-3">
            <label htmlFor="totalSeats" className="flex flex-1 items-center text-sm font-medium text-foreground">
              Seats
              {autoFilled.totalSeats && <AutoFilledBadge />}
            </label>
            <label htmlFor="pricePerSeat" className="flex flex-1 items-center text-sm font-medium text-foreground">
              Price per seat (₹)
              {autoFilled.pricePerSeat && <AutoFilledBadge />}
            </label>
          </div>
          <div className="flex gap-3">
            <input
              id="totalSeats"
              type="number"
              min={1}
              step={1}
              value={totalSeats}
              onChange={(e) => edited("totalSeats", setTotalSeats)(e.target.value)}
              className={`flex-1 ${INPUT_CLASS}`}
            />
            <input
              id="pricePerSeat"
              type="number"
              min={1}
              step={1}
              value={pricePerSeat}
              onChange={(e) => edited("pricePerSeat", setPricePerSeat)(e.target.value)}
              placeholder="350"
              className={`flex-1 ${INPUT_CLASS}`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="bookingId" className="mb-1.5 flex items-center text-sm font-medium text-foreground">
            Booking ID
            {autoFilled.bookingId && <AutoFilledBadge />}
          </label>
          <input
            id="bookingId"
            value={bookingId}
            onChange={(e) => edited("bookingId", setBookingId)(e.target.value)}
            placeholder="For verification only"
            className={INPUT_CLASS}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-foreground">Delivery method</legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-4 py-3">
              <input
                type="checkbox"
                checked={availableDeliveryMethods.includes("IN_PERSON")}
                onChange={() => toggleDeliveryMethod("IN_PERSON")}
                className="mt-0.5 accent-gold"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {DELIVERY_METHOD_LABEL.IN_PERSON}
                </span>
                <span className="block text-xs text-muted">
                  {DELIVERY_METHOD_DESCRIPTION.IN_PERSON}
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 ${
                eligibility?.emailForwardEligible ? "" : "opacity-60"
              }`}
            >
              <input
                type="checkbox"
                checked={availableDeliveryMethods.includes("EMAIL_FORWARD")}
                onChange={() => toggleDeliveryMethod("EMAIL_FORWARD")}
                disabled={!eligibility?.emailForwardEligible}
                className="mt-0.5 accent-gold"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {DELIVERY_METHOD_LABEL.EMAIL_FORWARD}
                </span>
                <span className="block text-xs text-muted">
                  {DELIVERY_METHOD_DESCRIPTION.EMAIL_FORWARD}
                </span>
                {eligibility && !eligibility.emailForwardEligible && (
                  <span className="mt-1 block text-xs text-muted">
                    Unlocks after {eligibility.requiredCompletedSales} completed sales with no
                    unresolved review flags (you have {eligibility.completedSales}
                    {eligibility.hasUnresolvedReviewFlags ? ", plus an unresolved review flag" : ""}
                    ).
                  </span>
                )}
              </span>
            </label>
          </div>
        </fieldset>

        <ErrorText>{error}</ErrorText>

        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={isScanning || venueStatus === "checking"}
        >
          {isSubmitting ? "Listing..." : "List my tickets"}
        </Button>
      </form>
    </main>
  );
}
