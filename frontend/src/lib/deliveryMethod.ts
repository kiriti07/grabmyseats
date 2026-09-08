import type { DeliveryMethod } from "@grabmyseats/shared";

export const DELIVERY_METHOD_LABEL: Record<DeliveryMethod, string> = {
  IN_PERSON: "Meet in person",
  EMAIL_FORWARD: "Email forward",
};

// Buyer-facing, one line each - shown on the listing detail page (before
// reserving) and the reserve card's picker, so a buyer knows what they're
// choosing before they commit. Both mention the check-in requirement since
// that's unchanged (or, for EMAIL_FORWARD, the seller's check-in is what's
// skipped - the buyer's own is not).
export const DELIVERY_METHOD_DESCRIPTION: Record<DeliveryMethod, string> = {
  IN_PERSON: "You and the seller both check in at the venue to hand off the ticket.",
  EMAIL_FORWARD:
    "The seller forwards the original booking confirmation email after payment - you still check in at the venue yourself.",
};
