import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../../config/env';
import type { IStorageProvider, UploadParams, UploadResult } from './provider.interface';

export class S3Provider implements IStorageProvider {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async upload({ buffer, fileName, mimeType, folder }: UploadParams): Promise<UploadResult> {
    const key = folder ? `${folder}/${fileName}` : fileName;

    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mimeType }),
    );

    return { path: key, url: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return env.BASE_MEDIA_URL
      ? `${env.BASE_MEDIA_URL}/${key}`
      : `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  private normalizePath(pathOrUrl: string): string {
    if (!pathOrUrl.startsWith('http')) {
      return pathOrUrl;
    }

    // Handle BASE_MEDIA_URL if present
    if (env.BASE_MEDIA_URL && pathOrUrl.startsWith(env.BASE_MEDIA_URL)) {
      return pathOrUrl.substring(env.BASE_MEDIA_URL.length).replace(/^\/+/, '');
    }

    // Handle S3 standard URL: https://{bucket}.s3.amazonaws.com/
    const s3Prefix = `https://${this.bucket}.s3.amazonaws.com/`;
    if (pathOrUrl.startsWith(s3Prefix)) {
      return pathOrUrl.substring(s3Prefix.length).replace(/^\/+/, '');
    }

    // Handle S3 region-specific URL: https://{bucket}.s3.{region}.amazonaws.com/
    const s3RegionPrefixRegex = new RegExp(`^https://${this.bucket}\\.s3\\.[a-z0-9-]+\\.amazonaws\\.com/`);
    const match = pathOrUrl.match(s3RegionPrefixRegex);
    if (match) {
      return pathOrUrl.substring(match[0].length).replace(/^\/+/, '');
    }

    return pathOrUrl;
  }

  async delete(filePath: string): Promise<void> {
    const key = this.normalizePath(filePath);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getSignedUrl(filePath: string): Promise<string> {
    const key = this.normalizePath(filePath);
    return awsGetSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 3600 },
    );
  }

  async getSignedUploadUrl(filePath: string, contentType: string): Promise<{ uploadUrl: string; fileUrl: string }> {
    const uploadUrl = await awsGetSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: filePath, ContentType: contentType }),
      { expiresIn: 900 },
    );

    const fileUrl = env.BASE_MEDIA_URL
      ? `${env.BASE_MEDIA_URL}/${filePath}`
      : `https://${this.bucket}.s3.amazonaws.com/${filePath}`;

    return { uploadUrl, fileUrl };
  }

  async download(filePath: string): Promise<Buffer> {
    const key = this.normalizePath(filePath);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = response.Body as any;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }

  async getReadStream(filePath: string): Promise<NodeJS.ReadableStream> {
    const key = this.normalizePath(filePath);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return response.Body as NodeJS.ReadableStream;
  }
}
