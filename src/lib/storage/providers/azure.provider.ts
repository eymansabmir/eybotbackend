import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { IStorageProvider, UploadParams } from "../storage-provider.interface";
import { getAzureContainerClient } from "../clients/azure.client";
import { env } from "../../../config/env";

export const createAzureProvider = (): IStorageProvider => {

  const upload = async ({ buffer, fileName, mimeType, folder }: UploadParams) => {
    const containerClient = getAzureContainerClient();
    const blobName = folder ? `${folder}/${fileName}` : fileName;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });

    return {
      path: blobName,
      url: blockBlobClient.url,
    };
  };

  const deleteFile = async (filePath: string) => {
    const containerClient = getAzureContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(filePath);
    await blockBlobClient.delete();
  };

  const generateSasUrl = (filePath: string, permissions: BlobSASPermissions, expiresMinutes: number) => {
    const containerClient = getAzureContainerClient();
    const sharedKeyCredential = new StorageSharedKeyCredential(
      env.AZURE_STORAGE_ACCOUNT!,
      env.AZURE_STORAGE_ACCESS_KEY!,
    );

    const expiresOn = new Date(Date.now() + expiresMinutes * 60 * 1000);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: containerClient.containerName,
        blobName: filePath,
        permissions,
        expiresOn,
      },
      sharedKeyCredential,
    ).toString();

    const blobClient = containerClient.getBlockBlobClient(filePath);
    return `${blobClient.url}?${sasToken}`;
  };

  const getSignedUrl = async (filePath: string) => {
    return generateSasUrl(filePath, BlobSASPermissions.parse("r"), 60); // 1 hour read
  };

  const getSignedUploadUrl = async (filePath: string, _contentType: string) => {
    const uploadUrl = generateSasUrl(filePath, BlobSASPermissions.parse("cw"), 15); // 15 min write
    const containerClient = getAzureContainerClient();
    const fileUrl = containerClient.getBlockBlobClient(filePath).url;

    return { uploadUrl, fileUrl };
  };

  return { upload, delete: deleteFile, getSignedUrl, getSignedUploadUrl };
};