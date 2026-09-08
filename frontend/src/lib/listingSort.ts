import type { MyListing } from "@grabmyseats/shared";

// Lower rank sorts first. Explicit tiers per the seller dashboard's
// ordering requirement: DISPUTED, then ESCROWED (awaiting handoff), then
// RESERVED (awaiting payment), then ACTIVE, then terminal states last.
// FLAGGED (needs review, same urgency as a dispute), BUYER_CONFIRMED
// (in progress but nothing left for the seller to do), PARTIALLY_SOLD
// (as live/sellable as ACTIVE), and SOLD (terminal but not literally
// EXPIRED) aren't called out explicitly - placed by the same "how much
// does the seller need to think about this right now" logic.
function attentionRank(listing: MyListing): number {
  const txnStatuses = listing.transactions.map((txn) => txn.status);
  if (listing.status === "FLAGGED" || txnStatuses.includes("DISPUTED")) return 0;
  if (txnStatuses.includes("ESCROWED")) return 1;
  if (txnStatuses.includes("RESERVED")) return 2;
  if (txnStatuses.includes("BUYER_CONFIRMED")) return 3;
  if (listing.status === "ACTIVE" || listing.status === "PARTIALLY_SOLD") return 4;
  if (listing.status === "SOLD") return 5;
  return 6; // EXPIRED / WITHDRAWN
}

export function sortMyListingsByAttention(listings: MyListing[]): MyListing[] {
  return [...listings].sort((a, b) => {
    const rankDiff = attentionRank(a) - attentionRank(b);
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.showtime).getTime() - new Date(b.showtime).getTime();
  });
}
