"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudinaryStorageProvider = void 0;
const cloudinary_1 = require("cloudinary");
// Reads CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>)
// from the environment.
cloudinary_1.v2.config();
function toPublicId(filename) {
    return filename
        .replace(/\.[^./]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "-");
}
class CloudinaryStorageProvider {
    async upload(file, filename, options) {
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.v2.uploader.upload_stream({
                folder: `grabmyseats/${options?.folder ?? "listings"}`,
                public_id: toPublicId(filename),
                resource_type: options?.resourceType ?? "image",
            }, (error, uploadResult) => {
                if (error || !uploadResult) {
                    reject(error ?? new Error("Cloudinary upload failed"));
                    return;
                }
                resolve(uploadResult);
            });
            stream.end(file);
        });
        return { url: result.secure_url };
    }
}
exports.CloudinaryStorageProvider = CloudinaryStorageProvider;
//# sourceMappingURL=CloudinaryStorageProvider.js.map