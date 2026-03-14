import path from 'path';
import crypto from 'crypto';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IStoragePlugin, UploadResult } from './storage.interface';
import type { IStorageProvider } from './providers/provider.interface';
import { createStorageProvider } from './providers/provider.factory';

function sanitizeFileName(original: string): string {
  const base = path.basename(original);
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${safe}`;
}

export class StoragePlugin implements IPlugin, IStoragePlugin {
  readonly name = 'storage';

  private _provider!: IStorageProvider;

  async initialize(_registry: IPluginRegistry): Promise<void> {
    this._provider = createStorageProvider();
    logger.info({ provider: process.env.STORAGE_PROVIDER ?? 'gcs' }, 'StoragePlugin: provider ready');
  }

  async shutdown(): Promise<void> {
    // Storage providers are stateless HTTP clients — nothing to close.
  }

  async uploadFile(file: Express.Multer.File, folder = 'uploads'): Promise<UploadResult> {
    return this._provider.upload({
      buffer: file.buffer,
      fileName: sanitizeFileName(file.originalname),
      mimeType: file.mimetype,
      folder,
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    return this._provider.delete(filePath);
  }

  async generateUploadUrl(
    fileName: string,
    contentType: string,
    folder: string,
  ): Promise<{ uploadUrl: string; fileUrl: string }> {
    if (!this._provider.getSignedUploadUrl) {
      throw new Error('[StoragePlugin] Current provider does not support presigned upload URLs');
    }
    const safeName = sanitizeFileName(fileName);
    const filePath = `${folder}/${safeName}`;
    return this._provider.getSignedUploadUrl(filePath, contentType);
  }

  async getSignedUrl(filePath: string): Promise<string> {
    if (!this._provider.getSignedUrl) {
      throw new Error('[StoragePlugin] Current provider does not support signed URLs');
    }
    return this._provider.getSignedUrl(filePath);
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    return this._provider.download(filePath);
  }
}
