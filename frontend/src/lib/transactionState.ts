import type { MyListingTransactionSummary } from "@grabmyseats/shared";

// Seller-facing plain language for a transaction's raw status - only for
// the statuses that represent something currently in progress or worth
// showing on the seller dashboard. PENDING/EXPIRED/REFUNDED return null so
// the card can skip rendering them entirely: an expired reservation
// attempt isn't seller-actionable info once the listing itself is back to
// ACTIVE.
export function describeTransactionState(
  txn: MyListingTransactionSummary,
): string | null {
  switch (txn.status) {
    case "RESERVED":
      return "Buyer reserved, awaiting payment";
    case "ESCROWED":
      return "Paid — awaiting handoff";
    case "DISPUTED":
      return "Under review";
    default:
      return null;
  }
}
