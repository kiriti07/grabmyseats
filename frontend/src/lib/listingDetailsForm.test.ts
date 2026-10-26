import { describe, expect, it } from "vitest";
import { LISTING_DESCRIPTION_CONTACT_MESSAGE, type MyListing } from "@grabmyseats/shared";
import {
  appendListingDetails,
  descriptionCounter,
  listingDetailsProblem,
  listingEditPatch,
  seatTypeForCategory,
} from "./listingDetailsForm";

describe("listing details form", () => {
  it("counts characters against 300", () => {
    expect(descriptionCounter("")).toBe("0/300");
    expect(descriptionCounter("Aisle")).toBe("5/300");
  });

  it("keeps a seat type only for a category that offers it", () => {
    expect(seatTypeForCategory("MOVIE", "RECLINER")).toBe("RECLINER");
    expect(seatTypeForCategory("EVENT", "RECLINER")).toBe("");
    expect(seatTypeForCategory("SPORT", "")).toBe("");
  });

  it("flags contact details, over-long text and unknown seat types before sending", () => {
    expect(listingDetailsProblem("MOVIE", "", "")).toBeNull();
    expect(listingDetailsProblem("MOVIE", "RECLINER", "Corner seats")).toBeNull();
    expect(listingDetailsProblem("MOVIE", "", "Call 98765 43210")).toBe(LISTING_DESCRIPTION_CONTACT_MESSAGE);
    expect(listingDetailsProblem("MOVIE", "", "x".repeat(301))).toMatch(/300 characters/);
    expect(listingDetailsProblem("MOVIE", "BALCONY", "")).toMatch(/seatType must be one of/);
    expect(listingDetailsProblem("EVENT", "RECLINER", "")).toMatch(/isn't available/);
  });

  it("only adds the fields to the create form when set", () => {
    const empty = new FormData();
    appendListingDetails(empty, "", "   ");
    expect(Array.from(empty.keys())).toEqual([]);

    const filled = new FormData();
    appendListingDetails(filled, "TOP_ROW", "Aisle seats");
    expect(filled.get("seatType")).toBe("TOP_ROW");
    expect(filled.get("description")).toBe("Aisle seats");
  });

  describe("edit patch", () => {
    const listing = {
      id: "l1",
      category: "MOVIE",
      pricePerSeat: 300,
      showtime: "2026-11-01T19:30:00.000Z",
      totalSeats: 2,
      availableSeats: 2,
      seatType: null,
      description: "Aisle seats",
    } as unknown as MyListing;
    const unchanged = {
      pricePerSeat: 300,
      showtime: "2026-11-01T19:30:00.000Z",
      totalSeats: 2,
      seatType: "",
      description: "Aisle seats",
    };

    it("is null when nothing changed (whitespace-only edits included)", () => {
      expect(listingEditPatch(listing, unchanged)).toBeNull();
      expect(listingEditPatch(listing, { ...unchanged, description: "  Aisle   seats " })).toBeNull();
      // Same instant, different spelling.
      expect(listingEditPatch(listing, { ...unchanged, showtime: "2026-11-01T19:30:00Z" })).toBeNull();
    });

    it("sends only seat type / description when only they changed - no showtime or seats", () => {
      expect(listingEditPatch(listing, { ...unchanged, seatType: "RECLINER", description: "Corner" })).toEqual({
        seatType: "RECLINER",
        description: "Corner",
      });
    });

    it("clears a description with null", () => {
      expect(listingEditPatch(listing, { ...unchanged, description: "" })).toEqual({ description: null });
    });

    it("sends a changed showtime, seat count and price", () => {
      expect(
        listingEditPatch(listing, {
          ...unchanged,
          pricePerSeat: 250,
          showtime: "2026-11-02T19:30:00.000Z",
          totalSeats: 3,
        }),
      ).toEqual({ pricePerSeat: 250, showtime: "2026-11-02T19:30:00.000Z", totalSeats: 3 });
    });

    it("treats an old listing (fields missing) as having neither", () => {
      const old = { ...listing, seatType: undefined, description: undefined } as unknown as MyListing;
      expect(listingEditPatch(old, { ...unchanged, description: "" })).toBeNull();
    });
  });
});
