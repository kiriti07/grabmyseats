import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import type { StorageProvider, StorageProviderUploadOptions } from "./StorageProvider";

// Reads CLOUDINARY_URL (cloudinary://<api_key>:<api_secret>@<cloud_name>)
// from the environment.
cloudinary.config();

function toPublicId(filename: string): string {
  return filename
    .replace(/\.[^./]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
}

export class CloudinaryStorageProvider implements StorageProvider {
  async upload(
    file: Buffer,
    filename: string,
    options?: StorageProviderUploadOptions,
  ): Promise<{ url: string }> {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `grabmyseats/${options?.folder ?? "listings"}`,
          public_id: toPublicId(filename),
          resource_type: options?.resourceType ?? "image",
        },
        (error, uploadResult) => {
          if (error || !uploadResult) {
            reject(error ?? new Error("Cloudinary upload failed"));
            return;
          }
          resolve(uploadResult);
        },
      );
      stream.end(file);
    });

    return { url: result.secure_url };
  }

  async delete(url: string): Promise<void> {
    const { publicId, resourceType } = parseCloudinaryUrl(url);
    const result = (await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    })) as { result?: string };
    // "not found" is fine - it's already gone.
    if (result?.result !== "ok" && result?.result !== "not found") {
      throw new Error(`Cloudinary delete failed: ${result?.result ?? "no result"}`);
    }
  }
}

// https://res.cloudinary.com/<cloud>/<image|raw>/upload/[v123/]grabmyseats/<folder>/<id>.<ext>
// -> public id "grabmyseats/<folder>/<id>" (raw files keep their extension
// in the public id). Only ever files under our own grabmyseats/ root.
export function parseCloudinaryUrl(url: string): { publicId: string; resourceType: "image" | "raw" } {
  const match = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:v\d+\/)?(grabmyseats\/.+)$/.exec(url);
  if (!match) throw new Error("Not a GrabMySeats Cloudinary url");
  const resourceType = match[1] as "image" | "raw";
  const path = decodeURIComponent(match[2]);
  return { publicId: resourceType === "raw" ? path : path.replace(/\.[^./]+$/, ""), resourceType };
}
