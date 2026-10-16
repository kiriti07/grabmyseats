import Link from "next/link";
import type { TicketAlertMatch } from "@grabmyseats/shared";
import { formatShowtimeFull } from "@/lib/format";

// Listings that matched an alert - each opens the listing page. Nothing
// about the seller is shown (or sent: see TicketAlertMatch).
export function AlertMatchList({ matches }: { matches: TicketAlertMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {matches.map((m) => (
        <li key={m.listingId}>
          <Link
            href={`/buy/${m.listingId}`}
            className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
              m.available ? "border-line bg-background hover:border-gold" : "border-line/60 bg-background opacity-60"
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{m.movieName}</span>
              <span className="block text-xs text-muted">
                {formatShowtimeFull(m.showtime)}
                {m.available ? ` · ${m.freeSeats} seat${m.freeSeats === 1 ? "" : "s"} · ₹${m.pricePerSeat}` : " · No longer available"}
              </span>
            </span>
            {!m.seen && m.available && (
              <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-[#1a1408]">New</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
