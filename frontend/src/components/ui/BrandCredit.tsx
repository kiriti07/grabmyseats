import Image from "next/image";

// The "Developed by Brilliant Eight" credit - logo above small muted text.
// Size and wording live only here; shown on /login, /signup (via
// IdentifierAuth) and the home page, deliberately not on functional pages
// (/sell, /buy, /account, transactions). className sets the outer spacing
// for where it's placed; the default suits the sign-in form. Never fixed or
// sticky - it always flows with the page.
// 72x98 matches the logo SVG's cropped 144x196 viewBox (2:1).
export function BrandCredit({ className = "mt-10" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <Image src="/images/brilliant-eight-logo.svg" alt="Brilliant Eight" width={72} height={98} />
      <p className="text-center text-xs text-muted">Developed by Brilliant Eight</p>
    </div>
  );
}
