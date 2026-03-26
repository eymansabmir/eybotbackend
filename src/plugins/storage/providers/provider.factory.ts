import { env } from '../../../config/env';
import type { IStorageProvider } from './provider.interface';
import { GcsProvider } from './gcs.provider';
import { S3Provider } from './s3.provider';
import { AzureProvider } from './azure.provider';

function parseGcsCredentialsFromEnv(): Record<string, unknown> | undefined {
  const raw = env.GCS_CREDENTIALS_JSON?.trim();
  if (!raw) {
    return undefined;
  }

  const candidates: string[] = [raw];

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) {
      candidates.push(decoded);
    }
  } catch {
    // Ignore base64 decode failures and fall back to raw JSON parsing.
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('[StoragePlugin] GCS_CREDENTIALS_JSON must be valid JSON (raw or base64 encoded JSON)');
}

export function createStorageProvider(): IStorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case 'gcs': {
      const { Storage } = require('@google-cloud/storage');
      const gcsCredentials = parseGcsCredentialsFromEnv();
      const storageOptions: Record<string, unknown> = {
        ...(env.GCS_PROJECT_ID ? { projectId: env.GCS_PROJECT_ID } : {}),
      };

      if (gcsCredentials) {
        storageOptions['credentials'] = gcsCredentials;
      } else if (env.GCS_KEY_FILE) {
        storageOptions['keyFilename'] = env.GCS_KEY_FILE;
      }

      const storage = new Storage(storageOptions);
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
