import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  ContainerClient
} from "@azure/storage-blob";
import { IStorageProvider, UploadParams } from "../storage-provider.interface";
import { env } from "../../../config/env";

export class AzureProvider implements IStorageProvider {
  constructor(private readonly containerClient: ContainerClient) { }

  public async upload({ buffer, fileName, mimeType, folder }: UploadParams) {
    const blobName = folder ? `${folder}/${fileName}` : fileName;
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });

    return {
      path: blobName,
      url: env.BASE_MEDIA_URL
        ? `${env.BASE_MEDIA_URL}/${blobName}`
        : blockBlobClient.url,
    };
  }

  public async delete(filePath: string) {
    const blockBlobClient = this.containerClient.getBlockBlobClient(filePath);
    await blockBlobClient.delete();
  }

  private generateSasUrl(filePath: string, permissions: BlobSASPermissions, expiresMinutes: number) {
    const sharedKeyCredential = new StorageSharedKeyCredential(
      env.AZURE_STORAGE_ACCOUNT!,
      env.AZURE_STORAGE_ACCESS_KEY!,
    );

    const expiresOn = new Date(Date.now() + expiresMinutes * 60 * 1000);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: this.containerClient.containerName,
        blobName: filePath,
        permissions,
        expiresOn,
      },
      sharedKeyCredential,
    ).toString();

    const blobClient = this.containerClient.getBlockBlobClient(filePath);
    return `${blobClient.url}?${sasToken}`;
  }

  public async getSignedUrl(filePath: string) {
    return this.generateSasUrl(filePath, BlobSASPermissions.parse("r"), 60); // 1 hour read
  }

  public async getSignedUploadUrl(filePath: string, _contentType: string) {
    const uploadUrl = this.generateSasUrl(filePath, BlobSASPermissions.parse("cw"), 15); // 15 min write
    const fileUrl = env.BASE_MEDIA_URL
      ? `${env.BASE_MEDIA_URL}/${filePath}`
      : this.containerClient.getBlockBlobClient(filePath).url;

    return { uploadUrl, fileUrl };
  }
}