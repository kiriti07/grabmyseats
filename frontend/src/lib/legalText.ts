// Turns the pasted Terms / Privacy text (src/content/legal/*.ts) into blocks
// for LegalPage. Deliberately tiny - no Markdown library, no HTML: lines
// starting "# " / "## " are headings, consecutive "- " / "* " lines are one
// bulleted list, and blank lines separate paragraphs. A paragraph keeps its
// own line breaks.

export type LegalBlock =
  | { kind: "h1" | "h2" | "p"; text: string }
  | { kind: "ul"; items: string[] };

export function parseLegalText(raw: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "p", text: paragraph.join("\n") });
    if (list.length) blocks.push({ kind: "ul", items: list });
    paragraph = [];
    list = [];
  };

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    const heading = /^(#{1,2})\s+(.+)$/.exec(trimmed);
    const bullet = /^[-*•]\s+(.+)$/.exec(trimmed);

    if (!trimmed) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: heading[1].length === 1 ? "h1" : "h2", text: heading[2] });
    } else if (bullet) {
      if (paragraph.length) flush();
      list.push(bullet[1]);
    } else {
      if (list.length) flush();
      paragraph.push(trimmed);
    }
  }
  flush();
  return blocks;
}
