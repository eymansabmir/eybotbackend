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

  async delete(filePath: string): Promise<void> {
    await this.bucket.file(filePath).delete();
  }

  async getSignedUrl(filePath: string): Promise<string> {
    const [url] = await this.bucket.file(filePath).getSignedUrl({
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
    const [buffer] = await this.bucket.file(filePath).download();
    return buffer;
  }
}
