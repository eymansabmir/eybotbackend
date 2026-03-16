import { env } from '../../../config/env';
import type { IStorageProvider } from './provider.interface';
import { GcsProvider } from './gcs.provider';
import { S3Provider } from './s3.provider';
import { AzureProvider } from './azure.provider';

export function createStorageProvider(): IStorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case 'gcs': {
      const { Storage } = require('@google-cloud/storage');
      const storage = new Storage({
        ...(env.GCS_PROJECT_ID ? { projectId: env.GCS_PROJECT_ID } : {}),
        ...(env.GCS_KEY_FILE ? { keyFilename: env.GCS_KEY_FILE } : {}),
      });
      if (!env.GCS_BUCKET_NAME) {
        throw new Error('[StoragePlugin] GCS_BUCKET_NAME is required when using GCS provider');
      }
      return new GcsProvider(storage.bucket(env.GCS_BUCKET_NAME));
    }

    case 's3': {
      const { S3Client } = require('@aws-sdk/client-s3');
      if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('[StoragePlugin] AWS credentials are required when using S3 provider');
      }
      if (!env.AWS_S3_BUCKET) {
        throw new Error('[StoragePlugin] AWS_S3_BUCKET is required when using S3 provider');
      }
      const client = new S3Client({
        ...(env.AWS_REGION ? { region: env.AWS_REGION } : {}),
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      });
      return new S3Provider(client, env.AWS_S3_BUCKET);
    }

    case 'azure': {
      const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
      if (!env.AZURE_STORAGE_ACCOUNT || !env.AZURE_STORAGE_ACCESS_KEY || !env.AZURE_CONTAINER_NAME) {
        throw new Error('[StoragePlugin] Azure credentials are required when using Azure provider');
      }
      const cred = new StorageSharedKeyCredential(env.AZURE_STORAGE_ACCOUNT, env.AZURE_STORAGE_ACCESS_KEY);
      const blobService = new BlobServiceClient(
        `https://${env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
        cred,
      );
      return new AzureProvider(blobService.getContainerClient(env.AZURE_CONTAINER_NAME));
    }

    default:
      throw new Error(`[StoragePlugin] Unknown storage provider: ${env.STORAGE_PROVIDER}`);
  }
}
