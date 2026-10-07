import { describe, expect, it } from "vitest";
import { CITY_BOUNDS, INDIAN_METRO_CITIES, isWithinCityBounds } from "@grabmyseats/shared";
import { buildVenueQueries, normalizeVenueText, parseTheaterName } from "./venueQueries";

// Bounded searches (the normal case): no city text in the queries.
const queries = (raw: string) => buildVenueQueries(raw);

describe("parseTheaterName / buildVenueQueries", () => {
  it("'ALLU Cinemas: Kokapet' keeps Kokapet as the locality", () => {
    expect(parseTheaterName("ALLU Cinemas: Kokapet")).toEqual({
      name: "ALLU Cinemas",
      locality: "Kokapet",
      fullParts: ["ALLU Cinemas", "Kokapet"],
    });
    expect(queries("ALLU Cinemas: Kokapet")).toEqual([
      // full name and name+locality are the same query here - tried once
      { q: "ALLU Cinemas, Kokapet", kind: "venue" },
      { q: "ALLU Cinemas", kind: "venue" },
      { q: "Kokapet", kind: "locality" },
    ]);
  });

  it("'PVR Superplex Inorbit: LUXE, PXL, 4DX: Cyberabad(SCREEN 10)': tiers and screen suffix stripped, Cyberabad is not a locality, Inorbit is (chain rule)", () => {
    const raw = "PVR Superplex Inorbit: LUXE, PXL, 4DX: Cyberabad(SCREEN 10)";
    expect(parseTheaterName(raw)).toMatchObject({ name: "PVR Superplex", locality: "Inorbit" });
    expect(queries(raw)).toEqual([
      { q: "PVR Superplex Inorbit, LUXE, PXL, 4DX", kind: "venue" },
      { q: "PVR Superplex, Inorbit", kind: "venue" },
      { q: "PVR Superplex", kind: "venue" },
      { q: "Inorbit", kind: "locality" },
    ]);
    const all = queries(raw).map((c) => c.q).join(" | ");
    expect(all).not.toMatch(/cyberabad/i);
    expect(all).not.toMatch(/screen|10/i);
  });

  it("'PVR Superplex Inorbit: LUXE, ...': the OCR ellipsis and tier are dropped; Inorbit found by the chain rule", () => {
    const raw = "PVR Superplex Inorbit: LUXE, ...";
    expect(parseTheaterName(raw)).toMatchObject({ name: "PVR Superplex", locality: "Inorbit" });
    expect(queries(raw)).toEqual([
      { q: "PVR Superplex Inorbit, LUXE", kind: "venue" },
      { q: "PVR Superplex, Inorbit", kind: "venue" },
      { q: "PVR Superplex", kind: "venue" },
      { q: "Inorbit", kind: "locality" },
    ]);
    expect(queries(raw).map((c) => c.q).join(" ")).not.toContain(".");
  });

  it("'PVR: Atrium Gachibowli, Hyderabad(AUDI 04)': audi suffix and the city part stripped; bare 'PVR' never queried alone", () => {
    const raw = "PVR: Atrium Gachibowli, Hyderabad(AUDI 04)";
    expect(parseTheaterName(raw)).toEqual({
      name: "PVR",
      locality: "Atrium Gachibowli",
      fullParts: ["PVR", "Atrium Gachibowli"],
    });
    expect(queries(raw)).toEqual([
      { q: "PVR, Atrium Gachibowli", kind: "venue" },
      { q: "Atrium Gachibowli", kind: "locality" },
    ]);
  });

  it("'ALLU Cinemas Kokapet Hyderabad' (no separator): trailing city dropped, locality after the venue-type word", () => {
    expect(parseTheaterName("ALLU Cinemas Kokapet Hyderabad")).toEqual({
      name: "ALLU Cinemas",
      locality: "Kokapet",
      fullParts: ["ALLU Cinemas Kokapet"],
    });
    expect(queries("ALLU Cinemas Kokapet Hyderabad")).toEqual([
      { q: "ALLU Cinemas Kokapet", kind: "venue" },
      { q: "ALLU Cinemas", kind: "venue" },
      { q: "Kokapet", kind: "locality" },
    ]);
  });

  it("'PVR Superplex Inorbit Hyderabad' (no separator): chain + format word, then the mall as locality", () => {
    expect(parseTheaterName("PVR Superplex Inorbit Hyderabad")).toEqual({
      name: "PVR Superplex",
      locality: "Inorbit",
      fullParts: ["PVR Superplex Inorbit"],
    });
    expect(queries("PVR Superplex Inorbit Hyderabad")).toEqual([
      { q: "PVR Superplex Inorbit", kind: "venue" },
      { q: "PVR Superplex", kind: "venue" },
      { q: "Inorbit", kind: "locality" },
    ]);
  });

  it("chain rule: other chains, and a city word inside the name is kept", () => {
    expect(parseTheaterName("INOX GVK One")).toMatchObject({ name: "INOX", locality: "GVK One" });
    expect(parseTheaterName("Cinepolis Hyderabad Central Mall Hyderabad")).toMatchObject({
      name: "Cinepolis",
      locality: "Hyderabad Central Mall",
    });
  });

  it("a name with no area: no locality query at all", () => {
    expect(parseTheaterName("Prasads Multiplex")).toEqual({
      name: "Prasads Multiplex",
      locality: null,
      fullParts: ["Prasads Multiplex"],
    });
    expect(queries("Prasads Multiplex")).toEqual([{ q: "Prasads Multiplex", kind: "venue" }]);
  });

  it("appends the city only when the search can't be bounded to it", () => {
    expect(buildVenueQueries("ALLU Cinemas: Kokapet", "Hyderabad").map((c) => c.q)).toEqual([
      "ALLU Cinemas, Kokapet, Hyderabad",
      "ALLU Cinemas, Hyderabad",
      "Kokapet, Hyderabad",
    ]);
  });

  it("a tier-only suffix is dropped, and tiers inside the name are removed from the name", () => {
    expect(parseTheaterName("PVR Icon: 4DX").locality).toBeNull();
    expect(parseTheaterName("INOX Insignia Screen 3").name).toBe("INOX");
    expect(parseTheaterName("Cinepolis: Gold Class, Nexus Mall").locality).toBe("Nexus Mall");
  });

  it("handles audi/screen suffix variants", () => {
    for (const raw of [
      "AMB Cinemas: Gachibowli (Audi 2)",
      "AMB Cinemas: Gachibowli AUDI-02",
      "AMB Cinemas: Gachibowli Screen 7",
      "AMB Cinemas: Gachibowli(scr 1)",
    ]) {
      expect(parseTheaterName(raw).locality).toBe("Gachibowli");
    }
  });

  it("normalizes for storage/matching", () => {
    expect(normalizeVenueText("  ALLU  Cinemas, (Kokapet)! ")).toBe("allu cinemas kokapet");
  });
});

describe("CITY_BOUNDS", () => {
  it("Hyderabad's box contains Kokapet, Gachibowli and Inorbit Mall Madhapur", () => {
    const places = {
      kokapet: { lat: 17.3916, lng: 78.3226 },
      gachibowli: { lat: 17.4401, lng: 78.3489 },
      inorbitMadhapur: { lat: 17.4347, lng: 78.3866 },
    };
    for (const p of Object.values(places)) {
      expect(isWithinCityBounds("hyderabad", p.lat, p.lng)).toBe(true);
    }
    // ...and not, say, Mumbai.
    expect(isWithinCityBounds("hyderabad", 19.076, 72.8777)).toBe(false);
  });

  it("every city's box contains its own center, and every city has a box", () => {
    for (const city of INDIAN_METRO_CITIES) {
      expect(CITY_BOUNDS[city.id]).toBeDefined();
      expect(isWithinCityBounds(city.id, city.lat, city.lng)).toBe(true);
    }
  });
});
