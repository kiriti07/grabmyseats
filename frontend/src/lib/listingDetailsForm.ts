import {
  LISTING_DESCRIPTION_MAX,
  checkListingDescription,
  checkSeatType,
  type Category,
  type MyListing,
  type UpdateListingInput,
} from "@grabmyseats/shared";

// Form-side helpers for a listing's seat type and description (see
// shared/src/listingDetails.ts). The backend repeats every check; these only
// show the message before a round trip.

// "123/300" under the description box. Counts what's typed (the textarea's
// maxLength caps the same count); the server's stored form can only be
// shorter, since it collapses whitespace.
export function descriptionCounter(text: string): string {
  return `${text.length}/${LISTING_DESCRIPTION_MAX}`;
}

// The seat type to keep when the sell form's category changes: cleared if
// the new category doesn't offer it.
export function seatTypeForCategory(category: Category, seatType: string): string {
  return checkSeatType(category, seatType).ok ? seatType : "";
}

// Why these can't be saved, or null when they're fine.
export function listingDetailsProblem(category: Category, seatType: string, description: string): string | null {
  const seat = checkSeatType(category, seatType);
  if (!seat.ok) return seat.error;
  const desc = checkListingDescription(description);
  return desc.ok ? null : desc.error;
}

// Adds them to the POST /api/listings form - only when set, so the request
// is the same as before for a seller who leaves them empty.
export function appendListingDetails(formData: FormData, seatType: string, description: string): void {
  if (seatType) formData.append("seatType", seatType);
  if (description.trim()) formData.append("description", description);
}

export interface ListingEditValues {
  pricePerSeat: number;
  // ISO string from the showtime picker.
  showtime: string;
  // Only when seat count is editable (nothing reserved or sold yet).
  totalSeats?: number;
  seatType: string;
  description: string;
}

// PATCH /api/listings/:id body with only what actually changed - so an
// unchanged showtime or seat count isn't sent (and doesn't re-run alert
// matching). null when nothing changed. A description is compared in its
// stored form, so only-whitespace edits don't count.
export function listingEditPatch(listing: MyListing, values: ListingEditValues): UpdateListingInput | null {
  const patch: UpdateListingInput = {};
  if (values.pricePerSeat !== listing.pricePerSeat) patch.pricePerSeat = values.pricePerSeat;
  if (new Date(values.showtime).getTime() !== new Date(listing.showtime).getTime()) {
    patch.showtime = values.showtime;
  }
  if (values.totalSeats !== undefined && values.totalSeats !== listing.totalSeats) {
    patch.totalSeats = values.totalSeats;
  }
  const seatType = values.seatType || null;
  if (seatType !== (listing.seatType ?? null)) patch.seatType = seatType;
  const desc = checkListingDescription(values.description);
  const description = desc.ok ? desc.value : values.description;
  if (description !== (listing.description ?? null)) patch.description = description;
  return Object.keys(patch).length > 0 ? patch : null;
}
