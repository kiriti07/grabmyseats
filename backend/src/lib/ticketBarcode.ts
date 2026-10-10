import fs from "node:fs";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import sharp, { type OutputInfo, type Sharp } from "sharp";

// Finds the barcode/QR code on a booking screenshot - required on every
// listing (POST /api/listings, POST /api/listings/ocr) and the input to the
// ticket fingerprint (lib/ticketFingerprint.ts).
//
// zxing-wasm is ZXing-C++ compiled to WebAssembly: no native addon, so it
// installs and runs the same on macOS and the linux/arm64 Docker image.
// Its .wasm file is read from node_modules here - by default the library
// fetches it from a CDN at runtime, which a server must not depend on.
//
// A WASM decode call can't be interrupted from the thread it runs on, so
// each scan decodes in its own short-lived worker thread that is terminated
// if the scan runs past its deadline (SCAN_TIMEOUT_MS). The module is
// compiled once, here, and handed to each worker, so starting one is cheap.

export const NO_TICKET_CODE_MESSAGE =
  "We couldn't find a ticket barcode or QR code in this image. Upload a clear screenshot of your booking confirmation.";

export const SCAN_TIMEOUT_MESSAGE =
  "We couldn't scan this image in time. Please try again in a moment.";

export class ScanTimeoutError extends Error {
  constructor() {
    super("Ticket barcode scan timed out");
  }
}

// Whole scan, all passes included.
const SCAN_TIMEOUT_MS = 8_000;

// Widths tried in order, stopping at the first that yields a code: phone
// screenshots are 1080-1440px wide (larger than decoding needs, and slower),
// and a QR code that's blurry at one scale is often crisp at another. The
// last pass is the largest image ever decoded - nothing is decoded at its
// uploaded size - and MAX_HEIGHT bounds very tall (scrolling) screenshots.
const PASS_WIDTHS = [1000, 700, 1400];
const MAX_HEIGHT = 3000;

// Upper bound on what sharp will even open (decompression bombs); uploads
// are already capped at 8MB by middleware/upload.ts.
const MAX_INPUT_PIXELS = 40_000_000;

// What booking apps put on tickets. Retail codes (EAN/UPC) are deliberately
// excluded, so the barcode on a product photo doesn't count as a ticket.
const TICKET_FORMATS = [
  "QRCode",
  "MicroQRCode",
  "Aztec",
  "PDF417",
  "DataMatrix",
  "Code128",
  "Code39",
  "Code93",
  "ITF",
];

// Shorter payloads are noise (a stray misread), not a ticket.
const MIN_PAYLOAD_LENGTH = 4;

export interface TicketCode {
  text: string;
  format: string;
}

interface Point {
  x: number;
  y: number;
}

interface WorkerCode {
  text: string;
  format: string;
  position: { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point };
}

const requireFromHere = createRequire(__filename);
const readerEntry = requireFromHere.resolve("zxing-wasm/reader");
const wasmPath = requireFromHere.resolve("zxing-wasm/reader/zxing_reader.wasm");

let compiledModule: Promise<WebAssembly.Module> | null = null;
function getCompiledModule(): Promise<WebAssembly.Module> {
  compiledModule ??= WebAssembly.compile(fs.readFileSync(wasmPath));
  return compiledModule;
}

// Plain JS (eval'd), so the same code runs under ts-node, vitest and the
// compiled build without a separate worker file to locate.
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const zxing = require(workerData.readerEntry);
zxing.prepareZXingModule({
  overrides: {
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(workerData.module, imports).then((instance) => done(instance, workerData.module));
      return {};
    },
    locateFile() {
      throw new Error("zxing-wasm must not fetch its wasm file");
    },
  },
});
parentPort.on("message", async ({ data, width, height, options }) => {
  try {
    const results = await zxing.readBarcodes(
      { data: new Uint8ClampedArray(data), width, height, colorSpace: "srgb" },
      options,
    );
    parentPort.postMessage({
      codes: results
        .filter((r) => r.isValid)
        .map((r) => ({ text: r.text, format: r.format, position: r.position })),
    });
  } catch (err) {
    parentPort.postMessage({ error: String((err && err.message) || err) });
  }
});
`;

class ScanWorker {
  private worker: Worker;

  constructor(module: WebAssembly.Module) {
    this.worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { readerEntry, module } });
  }

  decode(pixels: Buffer, width: number, height: number, timeoutMs: number): Promise<WorkerCode[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new ScanTimeoutError());
      }, timeoutMs);
      const onMessage = (msg: { codes?: WorkerCode[]; error?: string }) => {
        cleanup();
        if (msg.error !== undefined) reject(new Error(msg.error));
        else resolve(msg.codes ?? []);
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.worker.off("message", onMessage);
        this.worker.off("error", onError);
      };
      this.worker.on("message", onMessage);
      this.worker.on("error", onError);
      // Copied into a fresh ArrayBuffer and transferred, not cloned again.
      const copy = new Uint8Array(pixels).buffer;
      this.worker.postMessage(
        {
          data: copy,
          width,
          height,
          options: { formats: TICKET_FORMATS, tryHarder: true, maxNumberOfSymbols: 4 },
        },
        [copy],
      );
    });
  }

  terminate(): Promise<number> {
    return this.worker.terminate();
  }
}

function quadArea({ topLeft, topRight, bottomRight, bottomLeft }: WorkerCode["position"]): number {
  const pts = [topLeft, topRight, bottomRight, bottomLeft];
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Every distinct ticket code in the image, largest first (the ticket's own
// code is the prominent one). Empty when there's none, or the image can't be
// read at all. Throws ScanTimeoutError past the deadline.
export async function decodeTicketCodes(
  buffer: Buffer,
  { timeoutMs = SCAN_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<TicketCode[]> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => deadline - Date.now();

  let input: Sharp;
  let sourceWidth: number;
  try {
    input = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    const meta = await input.metadata();
    if (!meta.width || !meta.height) return [];
    // EXIF orientations 5-8 swap the sides.
    sourceWidth = (meta.orientation ?? 1) >= 5 ? meta.height : meta.width;
  } catch {
    return [];
  }

  const worker = new ScanWorker(await getCompiledModule());
  try {
    const tried = new Set<number>();
    for (const passWidth of PASS_WIDTHS) {
      // Never enlarged: a small image is decoded at its own size, once.
      const width = Math.min(passWidth, sourceWidth);
      if (tried.has(width)) continue;
      tried.add(width);
      if (remaining() <= 0) throw new ScanTimeoutError();

      let raw: { data: Buffer; info: OutputInfo };
      try {
        raw = await input
          .clone()
          .resize({ width, height: MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
          .ensureAlpha()
          .raw()
          .timeout({ seconds: Math.max(1, Math.ceil(remaining() / 1000)) })
          .toBuffer({ resolveWithObject: true });
      } catch (err) {
        if (remaining() <= 0) throw new ScanTimeoutError();
        // Undecodable / corrupt image: no code can be in it.
        console.warn("[ticket-barcode] could not prepare image", err);
        return [];
      }

      const codes = await worker.decode(raw.data, raw.info.width, raw.info.height, remaining());
      const byText = new Map<string, WorkerCode & { area: number }>();
      for (const code of codes) {
        if (code.text.trim().length < MIN_PAYLOAD_LENGTH) continue;
        const area = quadArea(code.position);
        const seen = byText.get(code.text);
        if (!seen || area > seen.area) byText.set(code.text, { ...code, area });
      }
      if (byText.size > 0) {
        return [...byText.values()]
          .sort((a, b) => b.area - a.area)
          .map(({ text, format }) => ({ text, format }));
      }
    }
    return [];
  } finally {
    // Also what stops a decode that's still running after a timeout.
    await worker.terminate();
  }
}
