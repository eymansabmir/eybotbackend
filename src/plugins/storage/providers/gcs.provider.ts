import type { Bucket } from '@google-cloud/storage';
import { env } from '../../../config/env';
import type { IStorageProvider, UploadParams, UploadResult } from './provider.interface';

export class GcsProvider implements IStorageProvider {
  constructor(private readonly bucket: Bucket) {}

  async upload({ buffer, fileName, mimeType, folder }: UploadParams): Promise<UploadResult> {
    const filePath = folder ? `${folder}/${fileName}` : fileName;
    const file = this.bucket.file(filePath);

    await file.save(buffer, { metadata: { contentType: mimeType } });

    return { path: filePath, url: this.getPublicUrl(filePath) };
  }

  getPublicUrl(filePath: string): string {
    return env.BASE_MEDIA_URL
      ? `${env.BASE_MEDIA_URL}/${filePath}`
      : `https://storage.googleapis.com/${this.bucket.name}/${filePath}`;
  }

  private normalizePath(pathOrUrl: string): string {
    if (!pathOrUrl.startsWith('http')) {
      return pathOrUrl;
    }

    // Handle BASE_MEDIA_URL if present
    if (env.BASE_MEDIA_URL && pathOrUrl.startsWith(env.BASE_MEDIA_URL)) {
      return pathOrUrl.substring(env.BASE_MEDIA_URL.length).replace(/^\/+/, '');
    }

    // Handle GCS standard URL: https://storage.googleapis.com/{bucket}/
    const gcsPrefix = `https://storage.googleapis.com/${this.bucket.name}/`;
    if (pathOrUrl.startsWith(gcsPrefix)) {
      return pathOrUrl.substring(gcsPrefix.length).replace(/^\/+/, '');
    }

    // Handle bucket-first URL: https://{bucket}.storage.googleapis.com/
    const bucketFirstPrefix = `https://${this.bucket.name}.storage.googleapis.com/`;
    if (pathOrUrl.startsWith(bucketFirstPrefix)) {
      return pathOrUrl.substring(bucketFirstPrefix.length).replace(/^\/+/, '');
    }

    return pathOrUrl;
  }

  async delete(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    await this.bucket.file(normalizedPath).delete();
  }

  async getSignedUrl(filePath: string): Promise<string> {
    const normalizedPath = this.normalizePath(filePath);
    const [url] = await this.bucket.file(normalizedPath).getSignedUrl({
      action: 'read',
      version: 'v4',
      expires: Date.now() + 3600 * 1000,
    });
    return url;
  }

  async getSignedUploadUrl(filePath: string, contentType: string): Promise<{ uploadUrl: string; fileUrl: string }> {
    const [uploadUrl] = await this.bucket.file(filePath).getSignedUrl({
      action: 'write',
      version: 'v4',
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });

    const fileUrl = env.BASE_MEDIA_URL
      ? `${env.BASE_MEDIA_URL}/${filePath}`
      : `https://storage.googleapis.com/${this.bucket.name}/${filePath}`;

    return { uploadUrl, fileUrl };
  }

  async download(filePath: string): Promise<Buffer> {
    const normalizedPath = this.normalizePath(filePath);
    logger.debug({ filePath, normalizedPath }, 'Downloading file from GCS');
    const [buffer] = await this.bucket.file(normalizedPath).download();
    return buffer;
  }
}
