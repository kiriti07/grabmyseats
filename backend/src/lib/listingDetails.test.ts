import { describe, expect, it } from "vitest";
import {
  LISTING_DESCRIPTION_CONTACT_MESSAGE,
  checkListingDescription,
  checkSeatType,
  normalizeListingDescription,
  seatTypeLabel,
} from "@grabmyseats/shared";

// The seat type / description rules POST and PATCH /api/listings enforce
// (shared/src/listingDetails.ts). No database.
describe("checkSeatType", () => {
  it("accepts every Movies option, and none / skip as null", () => {
    for (const v of ["RECLINER", "TOP_ROW", "MIDDLE_ROW", "BOTTOM_ROW"]) {
      expect(checkSeatType("MOVIE", v)).toEqual({ ok: true, value: v });
    }
    for (const none of [undefined, null, ""]) {
      expect(checkSeatType("MOVIE", none)).toEqual({ ok: true, value: null });
      expect(checkSeatType("EVENT", none)).toEqual({ ok: true, value: null });
    }
  });

  it("rejects unknown values, wrong case, non-strings and any seat type on Events/Sports", () => {
    expect(checkSeatType("MOVIE", "BALCONY").ok).toBe(false);
    expect(checkSeatType("MOVIE", "recliner").ok).toBe(false);
    expect(checkSeatType("MOVIE", "Recliner").ok).toBe(false);
    expect(checkSeatType("MOVIE", ["RECLINER"]).ok).toBe(false);
    expect(checkSeatType("MOVIE", 1).ok).toBe(false);
    expect(checkSeatType("EVENT", "RECLINER").ok).toBe(false);
    expect(checkSeatType("SPORT", "TOP_ROW").ok).toBe(false);
  });

  it("labels known values only", () => {
    expect(seatTypeLabel("MIDDLE_ROW")).toBe("Middle row");
    expect(seatTypeLabel("BALCONY")).toBeNull();
    expect(seatTypeLabel(null)).toBeNull();
  });
});

describe("checkListingDescription", () => {
  const ok = (raw: unknown) => {
    const r = checkListingDescription(raw);
    if (!r.ok) throw new Error(`expected ok for ${JSON.stringify(raw)}: ${r.error}`);
    return r.value;
  };
  const rejectedAsContact = (raw: string) =>
    expect(checkListingDescription(raw), raw).toEqual({ ok: false, error: LISTING_DESCRIPTION_CONTACT_MESSAGE });

  it("trims, collapses whitespace and line breaks, and drops invisible characters", () => {
    expect(ok("  Corner   seats\n\n next to\tthe aisle  ")).toBe("Corner seats next to the aisle");
    expect(ok("Aisle​ seats‮")).toBe("Aisle seats");
    expect(normalizeListingDescription("a\u0000b")).toBe("a b");
  });

  it("treats missing, null and blank as no description", () => {
    expect(ok(undefined)).toBeNull();
    expect(ok(null)).toBeNull();
    expect(ok("")).toBeNull();
    expect(ok(" \n\t ")).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(checkListingDescription(123).ok).toBe(false);
    expect(checkListingDescription({ text: "x" }).ok).toBe(false);
  });

  it("allows 300 characters and rejects 301 - counted after normalizing", () => {
    expect(ok("x".repeat(300))).toHaveLength(300);
    expect(checkListingDescription("x".repeat(301))).toEqual({
      ok: false,
      error: "Description must be 300 characters or fewer",
    });
    // 301 typed, but the doubled spaces collapse to 300.
    expect(ok(`${"x".repeat(149)}  ${"x".repeat(150)}`)).toHaveLength(300);
  });

  it("rejects phone numbers in their usual and disguised forms", () => {
    for (const s of [
      "Call 9876543210",
      "whatsapp +91 98765 43210",
      "ph: 098765-43210",
      "919876543210",
      "9 8 7 6 5 4 3 2 1 0",
      "(040) 2345 6789",
      "+44 20 7946 0958",
      "call 98765.43210",
      "９８７６５４３２１０", // fullwidth digits
      "98765​43210", // zero-width space in between
    ]) {
      rejectedAsContact(s);
    }
  });

  it("rejects email addresses, including (at)/(dot) disguises", () => {
    for (const s of [
      "mail me: priya@example.com",
      "priya.k+tix@gmail.co.in",
      "priya (at) gmail (dot) com",
      "priya[at]gmail[dot]com",
      "priya ＠ gmail.com",
    ]) {
      rejectedAsContact(s);
    }
  });

  it("rejects links", () => {
    for (const s of [
      "see https://example.com/seats",
      "http://x.y",
      "www.myseats.in",
      "WWW . example",
      "dm wa.me/919999999999",
      "t.me/seller",
      "bit.ly/abc",
      "myseats.com",
      "tickets dot com",
    ]) {
      rejectedAsContact(s);
    }
  });

  it("does not flag ordinary seat details", () => {
    for (const s of [
      "Corner seats, aisle side",
      "Seats G12, G13, G14 - middle of the row",
      "Row J 7-8, near the exit",
      "2 seats together, 3rd row from the screen",
      "Show on 26-10-2026 at 7:30 PM",
      "Paid ₹1250 for both, selling at cost",
      "Screen 4. In the middle block",
      "Seats at the back, best view",
      "IMAX 3D, glasses included @ counter",
    ]) {
      expect(ok(s), s).toBe(s);
    }
  });

  it("keeps HTML / script text as plain text (escaped on display, never rejected or interpreted)", () => {
    for (const s of [
      "<script>alert(1)</script>",
      `<img src=x onerror="alert(1)">`,
      `"><svg onload=alert(1)>`,
      "javascript&#58;alert(1)",
    ]) {
      expect(ok(s), s).toBe(s);
    }
    // A javascript: URL is a link.
    rejectedAsContact("javascript://alert(1)");
  });
});
