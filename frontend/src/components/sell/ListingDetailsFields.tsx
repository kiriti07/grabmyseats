import {
  LISTING_DESCRIPTION_MAX,
  SEAT_TYPE_OPTIONS,
  SEAT_TYPE_SKIP_LABEL,
  type Category,
} from "@grabmyseats/shared";
import { INPUT_CLASS } from "@/lib/styles";
import { descriptionCounter } from "@/lib/listingDetailsForm";

// The optional seat type dropdown (only for categories that have options -
// Movies for now) and description box, on the sell form and the My Listings
// edit panel. `idPrefix` keeps ids unique when several are on one page.
export function ListingDetailsFields({
  category,
  seatType,
  onSeatTypeChange,
  description,
  onDescriptionChange,
  idPrefix = "listing",
  small = false,
}: {
  category: Category;
  seatType: string;
  onSeatTypeChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  idPrefix?: string;
  // The edit panel's smaller labels.
  small?: boolean;
}) {
  const options = SEAT_TYPE_OPTIONS[category];
  const labelClass = small
    ? "mb-1 block text-xs font-medium text-foreground"
    : "mb-1.5 block text-sm font-medium text-foreground";

  return (
    <>
      {options.length > 0 && (
        <div>
          <label htmlFor={`${idPrefix}-seatType`} className={labelClass}>
            Seat type (optional)
          </label>
          <select
            id={`${idPrefix}-seatType`}
            value={seatType}
            onChange={(e) => onSeatTypeChange(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">{SEAT_TYPE_SKIP_LABEL}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-description`} className={labelClass}>
          Description (optional)
        </label>
        <textarea
          id={`${idPrefix}-description`}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          maxLength={LISTING_DESCRIPTION_MAX}
          rows={3}
          placeholder="e.g. corner seats, aisle, seats together in the middle of the row"
          aria-describedby={`${idPrefix}-description-hint`}
          className={`${INPUT_CLASS} resize-none`}
        />
        <p id={`${idPrefix}-description-hint`} className="mt-1 flex justify-between gap-3 text-xs text-muted">
          <span>No phone numbers, emails or links - buyers get your contact after reserving.</span>
          <span className="shrink-0 tabular-nums">
            {descriptionCounter(description)}
          </span>
        </p>
      </div>
    </>
  );
}
