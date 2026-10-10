import fs from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prepareZXingModule, writeBarcode, type WriteInputBarcodeFormat } from "zxing-wasm/writer";

// Test-only: a booking-screenshot-like PNG (a QR code on a phone-sized white
// card) whose payload is unique per call unless given, so every test listing
// passes POST /api/listings' barcode check without colliding with another
// listing's ticket fingerprint. The writer's .wasm is read from
// node_modules, never fetched.
const requireFromHere = createRequire(__filename);
prepareZXingModule({
  overrides: {
    wasmBinary: fs.readFileSync(requireFromHere.resolve("zxing-wasm/writer/zxing_writer.wasm"))
      .buffer as ArrayBuffer,
  },
});

export function uniqueTicketPayload(): string {
  return `TEST${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()},32696,29-Aug-2026,22:50`;
}

async function codePng(text: string, format: WriteInputBarcodeFormat, width: number): Promise<Buffer> {
  const { image } = await writeBarcode(text, { format, scale: 8 });
  if (!image) throw new Error("zxing-wasm wrote no barcode image");
  return sharp(Buffer.from(await image.arrayBuffer())).resize({ width }).png().toBuffer();
}

// `extra` adds a second, smaller code below the main one (another QR code,
// or e.g. an EAN-13 product barcode); `mainFormat` replaces the main QR code.
export async function ticketImage(
  payload = uniqueTicketPayload(),
  { extra, mainFormat = "QRCode" }: { extra?: { text: string; format?: WriteInputBarcodeFormat }; mainFormat?: WriteInputBarcodeFormat } = {},
): Promise<Buffer> {
  // Linear barcodes need the width for their bars to stay readable.
  const linear = !["QRCode", "Aztec", "DataMatrix", "PDF417"].includes(mainFormat);
  const layers = [
    linear
      ? { input: await codePng(payload, mainFormat, 600), left: 60, top: 500 }
      : { input: await codePng(payload, mainFormat, 300), left: 210, top: 500 },
  ];
  if (extra) {
    layers.push({ input: await codePng(extra.text, extra.format ?? "QRCode", 160), left: 280, top: 950 });
  }
  return sharp({ create: { width: 720, height: 1280, channels: 3, background: "#ffffff" } })
    .composite(layers)
    .png()
    .toBuffer();
}
