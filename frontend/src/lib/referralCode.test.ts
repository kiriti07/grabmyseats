import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSavedReferralCode,
  loadSavedReferralCode,
  normalizeReferralCode,
  saveReferralCode,
} from "./referralCode";

describe("normalizeReferralCode", () => {
  it("trims, drops spaces and dashes, uppercases", () => {
    expect(normalizeReferralCode("  abc-d ef7 ")).toBe("ABCDEF7");
    expect(normalizeReferralCode(null)).toBe("");
  });
});

describe("saved invite code", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage() {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
  }

  it("round-trips a normalized code and clears it", () => {
    stubStorage();
    saveReferralCode(" abc-defg ");
    expect(loadSavedReferralCode()).toBe("ABCDEFG");
    clearSavedReferralCode();
    expect(loadSavedReferralCode()).toBe("");
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveReferralCode("ABCDEFG")).not.toThrow();
    expect(loadSavedReferralCode()).toBe("");
    expect(() => clearSavedReferralCode()).not.toThrow();
  });
});
