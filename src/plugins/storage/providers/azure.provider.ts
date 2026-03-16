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

    const url = env.BASE_MEDIA_URL
      ? `${env.BASE_MEDIA_URL}/${blobName}`
      : blockBlobClient.url;

    return { path: blobName, url };
  }

  async delete(filePath: string): Promise<void> {
    await this.containerClient.getBlockBlobClient(filePath).delete();
  }

  async getSignedUrl(filePath: string): Promise<string> {
    return this.buildSasUrl(filePath, BlobSASPermissions.parse('r'), 60);
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
    const blockBlobClient = this.containerClient.getBlockBlobClient(filePath);
    return blockBlobClient.downloadToBuffer();
  }
}
