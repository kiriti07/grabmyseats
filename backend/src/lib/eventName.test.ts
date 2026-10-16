import { describe, expect, it } from "vitest";
import { eventKey, eventNamesMatch } from "./eventName";

describe("event name matching", () => {
  it.each([
    // The 10 pairs from the plan.
    ["Jailer", "JAILER (U/A)", true],
    ["Salaar", "Salaar: Part 1 – Ceasefire", true],
    ["Pushpa 2", "Pushpa 2: The Rule (A)", true],
    ["RCB vs CSK", "CSK vs RCB - IPL 2026", false],
    ["Coldplay", "Coldplay: Music of the Spheres World Tour", true],
    ["Devara Part 1", "Salaar Part 2", false],
    ["Pushpa 2", "Pushpa: The Rise", false],
    ["Leo", "Leon", false],
    ["Jailor", "Jailer (U/A)", true],
    ["IND vs AUS", "India vs Australia 3rd ODI", false],
    // Sequels and noise words.
    ["Jailer", "Jailer 2", false],
    ["Jailer 2", "Jailer", false],
    ["Jailer", "Jailer - Telugu IMAX 3D", true],
    ["Pushpa 2: The Rule", "PUSHPA 2 - THE RULE (Hindi) (3D)", true],
  ])("%s vs %s -> %s", (alert, listing, expected) => {
    expect(eventNamesMatch(alert, listing)).toBe(expected);
  });

  describe("a missing subtitle matches in both directions", () => {
    it.each([
      ["Pushpa 2", "Pushpa 2: The Rule"],
      ["Pushpa 2: The Rule", "Pushpa 2"],
      ["Coldplay", "Coldplay: Music of the Spheres"],
      ["Coldplay: Music of the Spheres", "Coldplay"],
      ["Salaar", "Salaar – Ceasefire"],
    ])("%s = %s", (a, b) => {
      expect(eventNamesMatch(a, b)).toBe(true);
    });

    it.each([
      ["Jailer", "Jailer 2"],
      ["Jailer", "Jailer 2: Return"],
      ["Pushpa", "Pushpa 2: The Rule"],
      ["Pushpa 2: The Rule", "Pushpa 2: The Rise"],
      ["Spider", "Spider-Man"],
      ["Pushpa 2: The Rule", "Pushpa 2: The Rise (3D)"],
    ])("%s != %s", (a, b) => {
      expect(eventNamesMatch(a, b)).toBe(false);
    });
  });

  it("ignores case, punctuation, spacing and noise words", () => {
    expect(eventKey("  Kalki 2898-AD (U/A)  [IMAX 3D]  Telugu ")).toBe("kalki 2898 ad");
    expect(eventNamesMatch("kalki   2898 ad", "KALKI 2898 AD")).toBe(true);
  });

  it("forgives one typo in one longer word only", () => {
    expect(eventNamesMatch("Jailor", "Jailer")).toBe(true);
    expect(eventNamesMatch("Kalki 2898 AD", "Kalky 2898 AD")).toBe(true);
    expect(eventNamesMatch("Kalki 2898 AD", "Kalki 2899 AD")).toBe(false);
    expect(eventNamesMatch("Jailor Returnz", "Jailer Returns")).toBe(false);
    expect(eventNamesMatch("Ponniyin Selvan", "Ponniyan Selvan")).toBe(true);
  });

  it("never matches empty names", () => {
    expect(eventNamesMatch("", "")).toBe(false);
    expect(eventNamesMatch("(U/A) 3D", "IMAX")).toBe(false);
  });
});
