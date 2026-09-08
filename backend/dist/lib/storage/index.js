"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageProvider = void 0;
const CloudinaryStorageProvider_1 = require("./CloudinaryStorageProvider");
// The rest of the app only depends on the StorageProvider interface, so
// swapping providers (e.g. to Cloudflare R2) is a one-file change: add
// e.g. R2StorageProvider (implementing StorageProvider) next to
// CloudinaryStorageProvider, then swap the line below.
exports.storageProvider = new CloudinaryStorageProvider_1.CloudinaryStorageProvider();
//# sourceMappingURL=index.js.map