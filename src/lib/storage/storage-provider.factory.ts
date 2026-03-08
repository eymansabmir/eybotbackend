import { IStorageProvider } from "./storage-provider.interface";
import { GcsProvider } from "./providers/gcs.provider";
import { S3Provider } from "./providers/s3.provider";
import { AzureProvider } from "./providers/azure.provider";
import { env } from "../../config/env";
import { getGcsBucket } from "./clients/gcs.client";
import { getS3Client, getS3Bucket } from "./clients/s3.client";
import { getAzureContainerClient } from "./clients/azure.client";

export function createStorageProvider(): IStorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case "gcs":
      return new GcsProvider(getGcsBucket());

    case "s3":
      return new S3Provider(getS3Client(), getS3Bucket());

    case "azure":
      return new AzureProvider(getAzureContainerClient());

    default:
      throw new Error("Invalid storage provider");
  }
}