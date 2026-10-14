import { describe, expect, it } from "vitest";
import { helpLinkSegments } from "./helpLinks";
import { HELP_TEXT } from "../content/help";

describe("helpLinkSegments", () => {
  it("links the support email as mailto:, keeping the text around it", () => {
    expect(helpLinkSegments("If it still doesn't arrive, email us at support@grabmyseats.com.")).toEqual([
      { text: "If it still doesn't arrive, email us at " },
      { text: "support@grabmyseats.com", href: "mailto:support@grabmyseats.com" },
      { text: "." },
    ]);
  });

  it("links the three policy paths and 'our Terms'", () => {
    expect(helpLinkSegments("Terms and Conditions: /terms")).toEqual([
      { text: "Terms and Conditions: " },
      { text: "/terms", href: "/terms" },
    ]);
    expect(helpLinkSegments("what we keep at /delete-account, or email")).toEqual([
      { text: "what we keep at " },
      { text: "/delete-account", href: "/delete-account" },
      { text: ", or email" },
    ]);
    expect(helpLinkSegments("outside the app. See our Terms.")).toEqual([
      { text: "outside the app. See our " },
      { text: "Terms", href: "/terms" },
      { text: "." },
    ]);
  });

  it("leaves everything else alone", () => {
    for (const line of [
      "Terms and Conditions",
      "https://grabmyseats.com/terms",
      "see /termsheet",
      "[RESPONSE TIME, e.g. 2 business days]",
    ]) {
      expect(helpLinkSegments(line)).toEqual([{ text: line }]);
    }
  });

  it("never changes the text itself", () => {
    for (const line of HELP_TEXT.split("\n")) {
      expect(helpLinkSegments(line).map((s) => s.text).join("")).toBe(line);
    }
  });

  it("finds every link the Help text mentions", () => {
    const hrefs = HELP_TEXT.split("\n").flatMap((l) => helpLinkSegments(l)).flatMap((s) => (s.href ? [s.href] : []));
    expect(hrefs.filter((h) => h.startsWith("mailto:"))).toHaveLength(3);
    expect(hrefs.filter((h) => h === "/terms")).toHaveLength(3);
    expect(hrefs.filter((h) => h === "/privacy")).toHaveLength(1);
    expect(hrefs.filter((h) => h === "/delete-account")).toHaveLength(2);
  });
});
