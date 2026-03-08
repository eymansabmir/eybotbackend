import { Bucket } from "@google-cloud/storage";
import { IStorageProvider, UploadParams } from "../storage-provider.interface";
import { env } from "../../../config/env";

export class GcsProvider implements IStorageProvider {
  constructor(private readonly bucket: Bucket) {
  }

  public async upload({ buffer, fileName, mimeType, folder }: UploadParams) {
    try {
      const path = folder ? `${folder}/${fileName}` : fileName;
      const file = this.bucket.file(path);

      await file.save(buffer, {
        metadata: { contentType: mimeType },
      });

      const url = env.BASE_MEDIA_URL
        ? `${env.BASE_MEDIA_URL}/${path}`
        : `https://storage.googleapis.com/${this.bucket.name}/${path}`;
      return { path, url };
    } catch (err) {
      console.error('[GCS] upload error:', err);
      throw err;
    }
  }

  public async delete(filePath: string) {
    await this.bucket.file(filePath).delete();
  }

  public async getSignedUrl(filePath: string) {
    const [url] = await this.bucket.file(filePath).getSignedUrl({
      action: "read",
      version: "v4",
      expires: Date.now() + 3600 * 1000,
    });
    return url;
  }

  public async getSignedUploadUrl(filePath: string, contentType: string) {
    try {
      const [uploadUrl] = await this.bucket.file(filePath).getSignedUrl({
        action: "write",
        version: "v4",
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
      });

      return {
        uploadUrl,
        fileUrl: env.BASE_MEDIA_URL
          ? `${env.BASE_MEDIA_URL}/${filePath}`
          : `https://storage.googleapis.com/${this.bucket.name}/${filePath}`,
      };
    } catch (err) {
      console.error('[GCS] getSignedUploadUrl error:', err);
      throw err;
    }
  }
}