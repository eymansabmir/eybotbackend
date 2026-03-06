import { IStorageProvider } from "./storage-provider.interface";
import { createGCSProvider } from "./providers/gcs.provider";
import { createS3Provider } from "./providers/s3.provider";
import { createAzureProvider } from "./providers/azure.provider";
import { env } from "../../config/env";

export function createStorageProvider(): IStorageProvider {
  console.log('[StorageFactory] Creating provider for:', env.STORAGE_PROVIDER);

  switch (env.STORAGE_PROVIDER) {

    case "gcs":
      return createGCSProvider();

    case "s3":
      return createS3Provider();

    case "azure":
      return createAzureProvider();

    default:
      throw new Error("Invalid storage provider");
  }
} 