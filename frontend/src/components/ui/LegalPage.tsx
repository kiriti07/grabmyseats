import Link from "next/link";
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";
import { parseLegalText } from "@/lib/legalText";

// /terms and /privacy. The text itself lives in src/content/legal/ (pasted
// in by the owner - none is written here); until it's filled in, the page
// stays the explicit "Coming soon" placeholder.
export function LegalPage({
  title,
  text,
  lastUpdated,
  placeholderMessage,
}: {
  title: string;
  text: string;
  lastUpdated: string;
  placeholderMessage: string;
}) {
  const blocks = parseLegalText(text);
  if (blocks.length === 0) return <ComingSoonPage title={title} message={placeholderMessage} />;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-2xl items-center">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-foreground">
          ← Account
        </Link>
      </header>

      <article className="mt-6 w-full max-w-2xl break-words">
        <h1 className="font-display text-3xl tracking-wide text-gold">{title}</h1>
        {lastUpdated && <p className="mt-1 text-sm text-muted">Last updated: {lastUpdated}</p>}

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-foreground">
          {blocks.map((block, i) => {
            switch (block.kind) {
              case "h1":
                return (
                  <h2 key={i} className="pt-4 font-display text-xl tracking-wide text-foreground">
                    {block.text}
                  </h2>
                );
              case "h2":
                return (
                  <h3 key={i} className="pt-2 text-base font-semibold text-foreground">
                    {block.text}
                  </h3>
                );
              case "ul":
                return (
                  <ul key={i} className="list-disc space-y-1 pl-5">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                );
              default:
                return (
                  <p key={i} className="whitespace-pre-line">
                    {block.text}
                  </p>
                );
            }
          })}
        </div>
      </article>
    </main>
  );
}
