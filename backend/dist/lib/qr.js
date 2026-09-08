"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeQrCode = decodeQrCode;
const jimp_1 = require("jimp");
const jsqr_1 = __importDefault(require("jsqr"));
// Decodes any QR code found in the image and returns the raw string as-is -
// deliberately no parsing/validation of its contents (it could be a
// BookMyShow deep link, a plain ticket code, anything). Returns null if
// no QR code is found or the image can't be decoded.
async function decodeQrCode(buffer) {
    try {
        const image = await jimp_1.Jimp.read(buffer);
        const { data, width, height } = image.bitmap;
        const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
        const result = (0, jsqr_1.default)(pixels, width, height);
        return result?.data ?? null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=qr.js.map