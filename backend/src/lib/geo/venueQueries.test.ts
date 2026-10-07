import { describe, expect, it } from "vitest";
import { CITY_BOUNDS, INDIAN_METRO_CITIES, isWithinCityBounds } from "@grabmyseats/shared";
import { buildVenueQueries, normalizeVenueText, parseTheaterName } from "./venueQueries";

const queries = (raw: string, city = "Hyderabad") => buildVenueQueries(raw, city);

describe("parseTheaterName / buildVenueQueries", () => {
  it("'ALLU Cinemas: Kokapet' keeps Kokapet as the locality", () => {
    expect(parseTheaterName("ALLU Cinemas: Kokapet")).toEqual({
      name: "ALLU Cinemas",
      locality: "Kokapet",
      fullParts: ["ALLU Cinemas", "Kokapet"],
    });
    expect(queries("ALLU Cinemas: Kokapet")).toEqual([
      // full name and name+locality are the same query here - tried once
      { q: "ALLU Cinemas, Kokapet, Hyderabad", kind: "venue" },
      { q: "ALLU Cinemas, Hyderabad", kind: "venue" },
      { q: "Kokapet, Hyderabad", kind: "locality" },
    ]);
  });

  it("'PVR Superplex Inorbit: LUXE, PXL, 4DX: Cyberabad(SCREEN 10)': tiers and screen suffix stripped, Cyberabad is not a locality", () => {
    const raw = "PVR Superplex Inorbit: LUXE, PXL, 4DX: Cyberabad(SCREEN 10)";
    const parsed = parseTheaterName(raw);
    expect(parsed.name).toBe("PVR Superplex Inorbit");
    expect(parsed.locality).toBeNull();
    expect(queries(raw)).toEqual([
      { q: "PVR Superplex Inorbit, LUXE, PXL, 4DX, Hyderabad", kind: "venue" },
      { q: "PVR Superplex Inorbit, Hyderabad", kind: "venue" },
    ]);
    const all = queries(raw).map((c) => c.q).join(" | ");
    expect(all).not.toMatch(/cyberabad/i);
    expect(all).not.toMatch(/screen|10/i);
    expect(queries(raw).some((c) => c.kind === "locality")).toBe(false);
  });

  it("'PVR Superplex Inorbit: LUXE, ...': the OCR ellipsis and tier leave no locality", () => {
    const raw = "PVR Superplex Inorbit: LUXE, ...";
    expect(parseTheaterName(raw).locality).toBeNull();
    expect(queries(raw)).toEqual([
      { q: "PVR Superplex Inorbit, LUXE, Hyderabad", kind: "venue" },
      { q: "PVR Superplex Inorbit, Hyderabad", kind: "venue" },
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
      { q: "PVR, Atrium Gachibowli, Hyderabad", kind: "venue" },
      { q: "Atrium Gachibowli, Hyderabad", kind: "locality" },
    ]);
  });

  it("a name with no area: no locality query at all", () => {
    expect(parseTheaterName("Prasads Multiplex")).toEqual({
      name: "Prasads Multiplex",
      locality: null,
      fullParts: ["Prasads Multiplex"],
    });
    expect(queries("Prasads Multiplex")).toEqual([{ q: "Prasads Multiplex, Hyderabad", kind: "venue" }]);
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
