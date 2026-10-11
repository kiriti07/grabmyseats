import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { SCREENSHOT_MESSAGES, screenshotProblem } from "./screenshotCheck";

describe("screenshotProblem", () => {
  it("maps the ticket check's responses to the seller-facing messages", () => {
    expect(screenshotProblem(new ApiError("server text", 422))).toEqual({
      message:
        "Your screenshot is missing a barcode or QR code. Please upload a clear screenshot of your booking confirmation that shows the barcode.",
      rejected: true,
    });
    expect(screenshotProblem(new ApiError("server text", 409))).toEqual({
      message: "This ticket has already been listed.",
      rejected: true,
    });
    for (const status of [429, 503]) {
      expect(screenshotProblem(new ApiError("server text", status))).toEqual({
        message: "We couldn't check your screenshot just now. Please try again in a moment.",
        rejected: false,
      });
    }
    expect(screenshotProblem(new ApiError("Couldn't reach the server.", 0))).toEqual({
      message: SCREENSHOT_MESSAGES.offline,
      rejected: false,
    });
    expect(SCREENSHOT_MESSAGES.offline).toBe("Couldn't reach the server. Check your connection and try again.");
  });

  it("leaves everything else to the form's usual handling", () => {
    for (const status of [400, 401, 403, 500]) {
      expect(screenshotProblem(new ApiError("x", status))).toBeNull();
    }
    expect(screenshotProblem(new Error("boom"))).toBeNull();
  });
});
