import type { Metadata } from "next";
import Link from "next/link";
import { HELP_TEXT } from "@/content/help";
import { parseLegalText, type LegalBlock } from "@/lib/legalText";
import { helpLinkSegments } from "@/lib/helpLinks";

// The Help Center. The text lives in src/content/help.ts; this page lays it
// out like /terms and /privacy (components/ui/LegalPage.tsx): the text's own
// "#" line is the page title, "##" sections, "###" questions. The "Contact
// us" section is shown as a card, and the support email and policy pages it
// mentions are links (lib/helpLinks.ts).
export const metadata: Metadata = {
  title: "Help Center - GrabMySeats",
};

const CONTACT_SECTION = "Contact us";

interface Section {
  heading: string | null;
  blocks: LegalBlock[];
}

function Linked({ text }: { text: string }) {
  return (
    <>
      {helpLinkSegments(text).map((segment, i) =>
        !segment.href ? (
          segment.text
        ) : segment.href.startsWith("mailto:") ? (
          <a key={i} href={segment.href} className="font-medium text-gold underline">
            {segment.text}
          </a>
        ) : (
          <Link key={i} href={segment.href} className="font-medium text-gold underline">
            {segment.text}
          </Link>
        ),
      )}
    </>
  );
}

function Blocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "h3":
            return (
              <h3 key={i} className="pt-2 text-base font-semibold text-foreground">
                {block.text}
              </h3>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Linked text={item} />
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} className="whitespace-pre-line">
                <Linked text={block.text} />
              </p>
            );
        }
      })}
    </>
  );
}

export default function HelpPage() {
  const blocks = parseLegalText(HELP_TEXT);
  const title = blocks.find((b) => b.kind === "h1");

  // Everything after the title, grouped under its "##" section heading.
  const sections: Section[] = [{ heading: null, blocks: [] }];
  for (const block of blocks) {
    if (block === title) continue;
    if (block.kind === "h2" || block.kind === "h1") sections.push({ heading: block.text, blocks: [] });
    else sections[sections.length - 1].blocks.push(block);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-2xl items-center">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-foreground">
          ← Account
        </Link>
      </header>

      <article className="mt-6 w-full max-w-2xl break-words">
        <h1 className="font-display text-3xl tracking-wide text-gold">
          {title?.kind === "h1" ? title.text : "Help Center"}
        </h1>

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-foreground">
          {sections.map((section, i) =>
            section.heading === CONTACT_SECTION ? (
              <section key={i} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
                <h2 className="font-display text-xl tracking-wide text-foreground">{section.heading}</h2>
                <Blocks blocks={section.blocks} />
              </section>
            ) : (
              <section key={i} className="space-y-4">
                {section.heading && (
                  <h2 className="pt-4 font-display text-xl tracking-wide text-foreground">
                    {section.heading}
                  </h2>
                )}
                <Blocks blocks={section.blocks} />
              </section>
            ),
          )}
        </div>
      </article>
    </main>
  );
}
