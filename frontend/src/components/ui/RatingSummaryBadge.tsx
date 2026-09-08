import type { RatingSummary } from "@grabmyseats/shared";

// Shown wherever a seller's rating needs to be surfaced - the listing
// detail page (before a buyer reserves) and the contact-reveal screen
// (buy page and transaction detail page) once contact is shown. Renders
// "No ratings yet" rather than "0.0 ★" for a new seller with
// totalRatings === 0, so they aren't visually penalized by an empty state
// that reads as a bad score.
export function RatingSummaryBadge({
  summary,
  className = "",
}: {
  summary: RatingSummary;
  className?: string;
}) {
  if (summary.totalRatings === 0) {
    return <span className={`text-sm text-muted ${className}`}>No ratings yet</span>;
  }

  return (
    <span className={`text-sm text-foreground ${className}`}>
      {summary.averageStars!.toFixed(1)} ★{" "}
      <span className="text-muted">
        ({summary.totalRatings} rating{summary.totalRatings === 1 ? "" : "s"})
      </span>
    </span>
  );
}
