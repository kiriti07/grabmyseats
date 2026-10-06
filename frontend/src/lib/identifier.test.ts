import { describe, expect, it } from "vitest";
import { normalizeIdentifier } from "./identifier";

describe("normalizeIdentifier", () => {
  it("trims and lowercases email", () => {
    expect(normalizeIdentifier("email", "  Priya@Example.COM ")).toBe("priya@example.com");
    expect(normalizeIdentifier("email", "not-an-email")).toBeNull();
  });

  it("strips phone formatting down to E.164", () => {
    expect(normalizeIdentifier("phone", "+91 98765-43210")).toBe("+919876543210");
    expect(normalizeIdentifier("phone", "(+91) 98765 43210")).toBe("+919876543210");
  });

  it("requires the country code on a phone", () => {
    expect(normalizeIdentifier("phone", "9876543210")).toBeNull();
  });
});
