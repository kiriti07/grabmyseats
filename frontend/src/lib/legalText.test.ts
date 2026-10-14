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

  it("leaves HTML and links as plain text", () => {
    expect(parseLegalText("<b>bold</b> [link](https://example.com)")).toEqual([
      { kind: "p", text: "<b>bold</b> [link](https://example.com)" },
    ]);
  });
});
