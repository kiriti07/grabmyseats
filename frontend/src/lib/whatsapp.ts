// Phone numbers are stored/validated as strict E.164 ("+<countrycode><digits>",
// no spaces or other formatting - see PHONE_RE in backend/src/routes/auth.ts,
// enforced at signup and never reformatted afterward), so stripping every
// non-digit character (just the leading "+" in practice) reliably produces
// exactly what wa.me expects: countrycode + number, digits only.
export function toWhatsAppLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}
