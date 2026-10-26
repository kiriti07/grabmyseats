import { seatTypeLabel } from "@grabmyseats/shared";

// A listing's optional seat type and seller description (see
// shared/src/listingDetails.ts), wherever a listing is shown. Renders nothing
// when neither is set - every listing made before they existed. Plain text
// only: React escapes it, and nothing here may ever render it as HTML.
// `compact` (search results) clamps the description to two lines.
export function ListingExtras({
  seatType,
  description,
  compact = false,
  className = "",
}: {
  // Optional so an older backend that doesn't send them still renders.
  seatType?: string | null;
  description?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const label = seatTypeLabel(seatType);
  if (!label && !description) return null;

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {label && (
        <p className="text-xs text-muted">
          Seat type: <span className="font-medium text-foreground">{label}</span>
        </p>
      )}
      {description && (
        <p
          className={`break-words text-foreground ${compact ? "line-clamp-2 text-xs" : "text-sm"}`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
