// Splits a line of the Help Center text (src/content/help.ts) into plain
// text and links, so the page can make what the text mentions clickable
// without the text itself containing any markup:
// - support@grabmyseats.com -> mailto:
// - /terms, /privacy, /delete-account (as whole words) -> those pages
// - "our Terms" -> /terms (only the word "Terms" is linked)
// Used on /help only - Terms and Privacy stay plain text.

export const SUPPORT_EMAIL = "support@grabmyseats.com";

export type HelpSegment = { text: string; href?: string };

const PATHS = ["/delete-account", "/terms", "/privacy"];
// No lookbehind, so it also runs on older Safari/iOS web views.
const TOKEN = /support@grabmyseats\.com|\/delete-account|\/terms|\/privacy|our Terms/g;

export function helpLinkSegments(line: string): HelpSegment[] {
  const segments: HelpSegment[] = [];
  let plain = "";
  let last = 0;

  const tokenRe = new RegExp(TOKEN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(line)) !== null) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    const before = start === 0 ? " " : line[start - 1];
    const after = end >= line.length ? " " : line[end];

    let link: HelpSegment | null = null;
    let prefix = "";
    if (token === SUPPORT_EMAIL) {
      link = { text: token, href: `mailto:${SUPPORT_EMAIL}` };
    } else if (PATHS.includes(token)) {
      // A whole path only: not part of a longer word or url.
      if (/\s/.test(before) && /[\s.,;:!?)]/.test(after)) link = { text: token, href: token };
    } else if (/[\s.,;:!?)]/.test(after)) {
      prefix = "our ";
      link = { text: "Terms", href: "/terms" };
    }

    if (!link) continue;
    plain += line.slice(last, start) + prefix;
    if (plain) segments.push({ text: plain });
    segments.push(link);
    plain = "";
    last = end;
  }

  plain += line.slice(last);
  if (plain) segments.push({ text: plain });
  return segments;
}
