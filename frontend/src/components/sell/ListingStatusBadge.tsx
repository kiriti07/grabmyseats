import type { ListingStatus } from "@grabmyseats/shared";

const LABEL: Record<ListingStatus, string> = {
  ACTIVE: "Active",
  PARTIALLY_SOLD: "Partially Sold",
  SOLD: "Sold",
  EXPIRED: "Expired",
  FLAGGED: "Flagged",
  WITHDRAWN: "Withdrawn",
};

// bg/border/text triples per status - gold/blue/green/gray/red/gray, in
// that order for ACTIVE/PARTIALLY_SOLD/SOLD/EXPIRED/FLAGGED/WITHDRAWN.
const CLASS: Record<ListingStatus, string> = {
  ACTIVE: "border-gold/40 bg-gold/10 text-gold",
  PARTIALLY_SOLD: "border-info/40 bg-info/10 text-info",
  SOLD: "border-success/40 bg-success/10 text-success",
  EXPIRED: "border-muted/40 bg-muted/10 text-muted",
  FLAGGED: "border-error/40 bg-error/10 text-error",
  WITHDRAWN: "border-muted/40 bg-muted/10 text-muted",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${CLASS[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}
