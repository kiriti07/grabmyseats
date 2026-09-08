import { toWhatsAppLink } from "@/lib/whatsapp";

// Shown alongside the existing tel: link wherever a contact is revealed -
// buy page's contact-reveal card and both of the transaction detail page's
// contact sections - only when the other party has flagged their number as
// WhatsApp-reachable (see hasWhatsapp on TransactionContact). Never shown
// on its own; the tel: link is always present regardless.
export function WhatsAppButton({ phone }: { phone: string }) {
  return (
    <a
      href={toWhatsAppLink(phone)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-center text-sm font-medium text-success hover:bg-success/15"
    >
      Message on WhatsApp
    </a>
  );
}
