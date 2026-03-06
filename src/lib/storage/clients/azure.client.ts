import {
    BlobServiceClient,
    StorageSharedKeyCredential,
    ContainerClient,
} from "@azure/storage-blob";
import { env } from "../../../config/env";

let _containerClient: ContainerClient | null = null;

/** Lazy-initialized Azure container client — only created when first accessed. */
export function getAzureContainerClient(): ContainerClient {
    if (!_containerClient) {
        if (!env.AZURE_STORAGE_ACCOUNT || !env.AZURE_STORAGE_ACCESS_KEY || !env.AZURE_CONTAINER_NAME) {
            throw new Error(
                "AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_ACCESS_KEY, and AZURE_CONTAINER_NAME are required when using Azure provider",
            );
        }

        const sharedKeyCredential = new StorageSharedKeyCredential(
            env.AZURE_STORAGE_ACCOUNT,
            env.AZURE_STORAGE_ACCESS_KEY,
        );

        const blobServiceClient = new BlobServiceClient(
            `https://${env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
            sharedKeyCredential,
        );

        _containerClient = blobServiceClient.getContainerClient(env.AZURE_CONTAINER_NAME);
    }

    return _containerClient;
}
