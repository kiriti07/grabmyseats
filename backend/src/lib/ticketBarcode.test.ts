import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { ScanTimeoutError, decodeTicketCodes } from "./ticketBarcode";
import { TicketFingerprintConfigError, ticketFingerprint } from "./ticketFingerprint";
import { ticketImage } from "../test/ticketImage";

const FIXTURES_DIR = path.join(__dirname, "__fixtures__/tickets");
const fixture = (file: string) => fs.readFileSync(path.join(FIXTURES_DIR, file));

// The reader, used directly (in this thread) only to prove a generated image
// is readable at all. Its .wasm comes from node_modules, never a CDN.
prepareZXingModule({
  overrides: {
    wasmBinary: fs.readFileSync(createRequire(__filename).resolve("zxing-wasm/reader/zxing_reader.wasm"))
      .buffer as ArrayBuffer,
  },
});

describe("decodeTicketCodes", () => {
  // Real booking screenshots (BookMyShow app shares and static cards).
  const TICKETS: [string, string][] = [
    ["drishyam3-app-share.jpeg", "WQXBJX9"],
    ["hokum-static-card.jpeg", "T2A2HDN,21285,15-May-2026,22:20"],
    ["irumudi-app-share.jpeg", "T2AXBB3,32696,29-Aug-2026,22:50"],
    ["irumudi-static-card.jpg", "TLANJAC,32696,29-Aug-2026,22:50"],
    ["ustaad-bhagat-singh-app-share.jpeg", "AACN0000530497,25392,19-Mar-2026,07:30"],
  ];

  it.each(TICKETS)("reads the ticket QR code on %s", async (file, payload) => {
    expect(await decodeTicketCodes(fixture(file))).toEqual([{ text: payload, format: "QRCode" }]);
  });

  it("finds nothing in a plain photo (a movie poster cropped from a booking screenshot)", async () => {
    expect(await decodeTicketCodes(fixture("plain-photo.jpeg"))).toEqual([]);
  });

  it("finds nothing in a real booking screenshot whose QR code has been removed", async () => {
    expect(await decodeTicketCodes(fixture("no-code-screenshot.jpeg"))).toEqual([]);
  });

  it("still finds the code in a large (3x) screenshot - decoded downscaled, never at full size", async () => {
    const large = await sharp(fixture("hokum-static-card.jpeg")).resize({ width: 718 * 3 }).jpeg().toBuffer();
    expect(await decodeTicketCodes(large)).toEqual([
      { text: "T2A2HDN,21285,15-May-2026,22:20", format: "QRCode" },
    ]);
  });

  it("reads ticket barcodes as well as QR codes", async () => {
    const image = await ticketImage("TKT-0042-9981", { mainFormat: "Code128" });
    expect(await decodeTicketCodes(image)).toEqual([{ text: "TKT-0042-9981", format: "Code128" }]);
  });

  it("ignores retail product barcodes (EAN-13)", async () => {
    const image = await ticketImage("8901234567890", { mainFormat: "EAN13" });
    expect(await decodeTicketCodes(image)).toEqual([]);
    // ...because of the format list, not because the image is unreadable.
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const anyFormat = await readBarcodes(
      { data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: "srgb" },
      { tryHarder: true },
    );
    expect(anyFormat.map((r) => r.text)).toEqual(["8901234567890"]);
  });

  it("returns every code, the largest first", async () => {
    const image = await ticketImage("MAIN-TICKET-001", { extra: { text: "SMALL-DECOY-002" } });
    expect((await decodeTicketCodes(image)).map((c) => c.text)).toEqual(["MAIN-TICKET-001", "SMALL-DECOY-002"]);
  });

  it("returns nothing for bytes that aren't an image", async () => {
    expect(await decodeTicketCodes(Buffer.from("definitely not an image"))).toEqual([]);
  });

  it("gives up with ScanTimeoutError past the per-scan deadline", async () => {
    await expect(decodeTicketCodes(fixture("hokum-static-card.jpeg"), { timeoutMs: 1 })).rejects.toBeInstanceOf(
      ScanTimeoutError,
    );
    // ...and the next scan is unaffected.
    expect(await decodeTicketCodes(fixture("irumudi-static-card.jpg"))).toHaveLength(1);
  });
});

describe("ticketFingerprint", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a stable HMAC-SHA256 hex digest of the trimmed payload", () => {
    const fp = ticketFingerprint("T2A2HDN,21285,15-May-2026,22:20");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(ticketFingerprint("  T2A2HDN,21285,15-May-2026,22:20\n")).toBe(fp);
    expect(ticketFingerprint("T2A2HDN,21285,15-May-2026,22:21")).not.toBe(fp);
  });

  it("depends on the secret", () => {
    const before = ticketFingerprint("WQXBJX9");
    vi.stubEnv("TICKET_FINGERPRINT_SECRET", "a-completely-different-secret-of-32-plus-chars");
    expect(ticketFingerprint("WQXBJX9")).not.toBe(before);
  });

  it("refuses to work without a (long enough) secret - there is no fallback", () => {
    vi.stubEnv("TICKET_FINGERPRINT_SECRET", "");
    expect(() => ticketFingerprint("WQXBJX9")).toThrow(TicketFingerprintConfigError);
    vi.stubEnv("TICKET_FINGERPRINT_SECRET", "too-short");
    expect(() => ticketFingerprint("WQXBJX9")).toThrow(TicketFingerprintConfigError);
  });
});
