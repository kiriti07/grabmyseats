"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isVisionConfigured = isVisionConfigured;
exports.extractTextFromImageVision = extractTextFromImageVision;
let clientPromise = null;
// Vision is considered "configured" the same way the SDK's Application
// Default Credentials resolution works: a service-account key file path,
// or (simpler for deployments that prefer it) a raw API key. Neither
// exists in this repo today - see backend/src/lib/ocr.ts - so this stays
// false in local dev/CI and the Tesseract fallback runs instead.
function isVisionConfigured() {
    return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_VISION_API_KEY);
}
async function getClient() {
    if (!clientPromise) {
        clientPromise = Promise.resolve().then(() => __importStar(require("@google-cloud/vision"))).then(({ ImageAnnotatorClient }) => {
            const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
            return new ImageAnnotatorClient(apiKey ? { apiKey } : undefined);
        });
    }
    return clientPromise;
}
// Vision has no native "line" concept the way Tesseract does - just
// blocks > paragraphs > words > symbols. Lines are reconstructed below by
// walking each paragraph's words and cutting a new line whenever a word's
// last symbol carries a LINE_BREAK (or EOL_SURE_SPACE) detected break,
// unioning the bounding boxes of the words on each line.
async function extractTextFromImageVision(buffer) {
    const client = await getClient();
    const [result] = await client.documentTextDetection({ image: { content: buffer } });
    const page = result.fullTextAnnotation?.pages?.[0];
    const fullText = result.fullTextAnnotation?.text ?? "";
    if (!page)
        return { text: fullText, lines: [] };
    const lines = [];
    for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
            let current = [];
            const flush = () => {
                if (current.length === 0)
                    return;
                const text = current
                    .map((w) => (w.symbols ?? []).map((s) => s.text ?? "").join(""))
                    .join(" ")
                    .trim();
                const words = current;
                current = [];
                if (!text)
                    return;
                const xs = [];
                const ys = [];
                const confidences = [];
                for (const w of words) {
                    for (const v of w.boundingBox?.vertices ?? []) {
                        xs.push(v.x ?? 0);
                        ys.push(v.y ?? 0);
                    }
                    // Vision doesn't always populate per-word confidence; default to
                    // a high value so an unscored word doesn't get treated as noise
                    // the way a genuinely low-confidence Tesseract line would be.
                    confidences.push(w.confidence ?? 0.9);
                }
                if (xs.length === 0)
                    return;
                lines.push({
                    text,
                    confidence: (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100,
                    height: Math.max(...ys) - Math.min(...ys),
                    x0: Math.min(...xs),
                    y0: Math.min(...ys),
                    x1: Math.max(...xs),
                    y1: Math.max(...ys),
                });
            };
            for (const word of paragraph.words ?? []) {
                current.push(word);
                const lastSymbol = word.symbols?.[word.symbols.length - 1];
                const breakType = lastSymbol?.property?.detectedBreak?.type;
                if (breakType === "LINE_BREAK" || breakType === "EOL_SURE_SPACE") {
                    flush();
                }
            }
            flush();
        }
    }
    return { text: fullText, lines };
}
//# sourceMappingURL=ocrVision.js.map