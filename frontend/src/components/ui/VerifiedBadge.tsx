// Shown next to a name/identity line wherever isVerified reads true -
// /account (the user's own), the listing detail page's seller info
// (ListingDetail.sellerIsVerified), and the contact-reveal screen
// (TransactionContact.isVerified). Never rendered at all when not
// verified - there's no "unverified" state for this badge to show.
export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold ${className}`}
    >
      ✓ Verified
    </span>
  );
}
