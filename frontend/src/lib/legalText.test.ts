import { describe, expect, it } from "vitest";
import { parseLegalText } from "./legalText";

describe("parseLegalText", () => {
  it("is empty for blank text, so the page keeps its placeholder", () => {
    expect(parseLegalText("")).toEqual([]);
    expect(parseLegalText("\n   \n")).toEqual([]);
  });

  it("splits headings, paragraphs and bullet lists", () => {
    const text = [
      "# 1. Introduction",
      "First line of a paragraph",
      "  continues here.",
      "",
      "## 1.1 Scope",
      "- one",
      "* two",
      "Next paragraph.",
      "",
      "",
      "Last.",
    ].join("\r\n");
    expect(parseLegalText(text)).toEqual([
      { kind: "h1", text: "1. Introduction" },
      { kind: "p", text: "First line of a paragraph\ncontinues here." },
      { kind: "h2", text: "1.1 Scope" },
      { kind: "ul", items: ["one", "two"] },
      { kind: "p", text: "Next paragraph." },
      { kind: "p", text: "Last." },
    ]);
  });

  it("reads ### as a third heading level, ending the list or paragraph before it", () => {
    expect(parseLegalText("## Section\n### Question?\nAnswer.\n- a\n### Next?\nMore.")).toEqual([
      { kind: "h2", text: "Section" },
      { kind: "h3", text: "Question?" },
      { kind: "p", text: "Answer." },
      { kind: "ul", items: ["a"] },
      { kind: "h3", text: "Next?" },
      { kind: "p", text: "More." },
    ]);
    expect(parseLegalText("#### Too deep")).toEqual([{ kind: "p", text: "#### Too deep" }]);
  });

  it("leaves HTML and links as plain text", () => {
    expect(parseLegalText("<b>bold</b> [link](https://example.com)")).toEqual([
      { kind: "p", text: "<b>bold</b> [link](https://example.com)" },
    ]);
  });
});
