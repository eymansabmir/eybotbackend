import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  type ContainerClient,
} from '@azure/storage-blob';
import { env } from '../../../config/env';
import type { IStorageProvider, UploadParams, UploadResult } from './provider.interface';

export class AzureProvider implements IStorageProvider {
  constructor(private readonly containerClient: ContainerClient) {}

  async upload({ buffer, fileName, mimeType, folder }: UploadParams): Promise<UploadResult> {
    const blobName = folder ? `${folder}/${fileName}` : fileName;
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });

    return { path: blobName, url: this.getPublicUrl(blobName) };
  }

  getPublicUrl(blobName: string): string {
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    return env.BASE_MEDIA_URL
      ? `${env.BASE_MEDIA_URL}/${blobName}`
      : blockBlobClient.url;
  }

  private normalizePath(pathOrUrl: string): string {
    if (!pathOrUrl.startsWith('http')) {
      return pathOrUrl;
    }

    // Handle BASE_MEDIA_URL if present
    if (env.BASE_MEDIA_URL && pathOrUrl.startsWith(env.BASE_MEDIA_URL)) {
      return pathOrUrl.substring(env.BASE_MEDIA_URL.length).replace(/^\/+/, '');
    }

    // Handle Azure standard URL: https://{account}.blob.core.windows.net/{container}/
    const azurePrefix = this.containerClient.url;
    if (pathOrUrl.startsWith(azurePrefix)) {
      return pathOrUrl.substring(azurePrefix.length).replace(/^\/+/, '');
    }

    return pathOrUrl;
  }

  async delete(filePath: string): Promise<void> {
    const blobName = this.normalizePath(filePath);
    await this.containerClient.getBlockBlobClient(blobName).delete();
  }

  async getSignedUrl(filePath: string): Promise<string> {
    const blobName = this.normalizePath(filePath);
    return this.buildSasUrl(blobName, BlobSASPermissions.parse('r'), 60);
  }

  async getSignedUploadUrl(filePath: string, _contentType: string): Promise<{ uploadUrl: string; fileUrl: string }> {
    const uploadUrl = this.buildSasUrl(filePath, BlobSASPermissions.parse('cw'), 15);
    const fileUrl = env.BASE_MEDIA_URL
      ? `${env.BASE_MEDIA_URL}/${filePath}`
      : this.containerClient.getBlockBlobClient(filePath).url;

    return { uploadUrl, fileUrl };
  }

  private buildSasUrl(filePath: string, permissions: BlobSASPermissions, expiresMinutes: number): string {
    const cred = new StorageSharedKeyCredential(
      env.AZURE_STORAGE_ACCOUNT!,
      env.AZURE_STORAGE_ACCESS_KEY!,
    );

    const expiresOn = new Date(Date.now() + expiresMinutes * 60 * 1000);
    const sasToken = generateBlobSASQueryParameters(
      { containerName: this.containerClient.containerName, blobName: filePath, permissions, expiresOn },
      cred,
    ).toString();

    const blobClient = this.containerClient.getBlockBlobClient(filePath);
    return `${blobClient.url}?${sasToken}`;
  }

  async download(filePath: string): Promise<Buffer> {
    const blobName = this.normalizePath(filePath);
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
    return blockBlobClient.downloadToBuffer();
  }
}
