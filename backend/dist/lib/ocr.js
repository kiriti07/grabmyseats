"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromImage = extractTextFromImage;
const node_path_1 = __importDefault(require("node:path"));
const tesseract_js_1 = require("tesseract.js");
const cropPosterRegion_1 = require("./cropPosterRegion");
const ocrVision_1 = require("./ocrVision");
// Tesseract workers are expensive to spin up (loads the WASM core and the
// English trained-data model, downloading it on first use), so this app
// keeps one warm worker instead of creating/tearing one down per request.
// No API key / external service needed (unlike Google Cloud Vision) -
// keeps the cost and setup for OCR at zero, which is why it remains the
// fallback engine when Vision isn't configured (see extractTextFromImage).
let workerPromise = null;
function getWorker() {
    if (!workerPromise) {
        workerPromise = (0, tesseract_js_1.createWorker)("eng", undefined, {
            cachePath: node_path_1.default.join(__dirname, "../../.tesseract-cache"),
        });
    }
    return workerPromise;
}
async function extractTextFromImageTesseract(buffer) {
    const worker = await getWorker();
    const { data } = await worker.recognize(buffer, {}, { blocks: true });
    // Tesseract's top-level "blocks" are page-layout regions, which for a
    // visually dense ticket screenshot often merge into a single block
    // covering the whole image - useless as a proxy for "biggest text on
    // the page". Lines (block > paragraph > line) are a much finer-grained
    // unit and still carry their own bbox, so line height stands in for
    // font size instead.
    const lines = [];
    for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
            for (const line of paragraph.lines) {
                const text = line.text.trim();
                if (!text)
                    continue;
                lines.push({
                    text,
                    confidence: line.confidence,
                    height: line.bbox.y1 - line.bbox.y0,
                    x0: line.bbox.x0,
                    y0: line.bbox.y0,
                    x1: line.bbox.x1,
                    y1: line.bbox.y1,
                });
            }
        }
    }
    return { text: data.text, lines };
}
// Google Cloud Vision (DOCUMENT_TEXT_DETECTION) reads real ticket
// screenshots far more reliably than Tesseract - fewer misread icons
// merged into text, better handling of stylized poster art - so it's
// used whenever credentials are configured. Tesseract remains the
// fallback for local dev/CI, which has no Google credentials.
//
// skipPosterCrop bypasses cropPosterRegion - for EVENT/SPORT tickets (see
// POST /api/listings/ocr), which don't fit the movie-poster-thumbnail
// layout that mask is calibrated against; masking a corner of a ticket
// format it was never tuned for risks painting over real content instead
// of poster art.
async function extractTextFromImage(buffer, options) {
    const source = options?.skipPosterCrop ? buffer : await (0, cropPosterRegion_1.cropPosterRegion)(buffer);
    if ((0, ocrVision_1.isVisionConfigured)()) {
        try {
            return await (0, ocrVision_1.extractTextFromImageVision)(source);
        }
        catch (err) {
            console.warn("Google Cloud Vision OCR failed, falling back to Tesseract:", err);
        }
    }
    return extractTextFromImageTesseract(source);
}
//# sourceMappingURL=ocr.js.map