import { WhatsAppButton } from "@/components/ui/WhatsAppButton";

// Every place another party's phone is revealed (TransactionContact) goes
// through this, so the "Unverified" label can't be left off one of them: a
// phone only counts as verified once proven by SMS code
// (TransactionContact.phoneVerified) - separate from the ✓ Verified badge
// next to the name, which is about their email. A buyer may have no phone
// at all (only sellers are required to add one).
export function ContactPhone({
  phone,
  phoneVerified,
  hasWhatsapp,
  className = "",
  linkClassName = "",
}: {
  phone: string | null;
  phoneVerified: boolean;
  hasWhatsapp: boolean;
  className?: string;
  linkClassName?: string;
}) {
  if (!phone) {
    return <p className={`mt-1 text-sm text-muted ${className}`}>No phone number on file</p>;
  }

  return (
    <>
      <p className={`mt-1 flex flex-wrap items-center gap-1.5 ${className}`}>
        <a href={`tel:${phone}`} className={linkClassName}>
          {phone}
        </a>
        {!phoneVerified && (
          <span
            title="Added by this user - GrabMySeats hasn't verified this number"
            className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs font-medium text-muted"
          >
            Unverified
          </span>
        )}
      </p>
      {hasWhatsapp && <WhatsAppButton phone={phone} />}
    </>
  );
}
