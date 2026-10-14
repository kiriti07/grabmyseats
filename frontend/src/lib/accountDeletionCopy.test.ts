import { describe, expect, it } from "vitest";
import { DELETION_KEPT, DELETION_RETENTION_YEARS, isDeleteConfirmation } from "./accountDeletionCopy";

describe("account deletion confirmation", () => {
  it("accepts only the word DELETE", () => {
    expect(isDeleteConfirmation("DELETE")).toBe(true);
    expect(isDeleteConfirmation("  DELETE ")).toBe(true);
    for (const typed of ["", "delete", "Delete", "DELETED", "DEL ETE", "DELETE ME"]) {
      expect(isDeleteConfirmation(typed)).toBe(false);
    }
  });

  it("states the 3-year retention", () => {
    expect(DELETION_RETENTION_YEARS).toBe(3);
    expect(DELETION_KEPT.filter((line) => line.includes("3 years"))).toHaveLength(2);
  });
});
