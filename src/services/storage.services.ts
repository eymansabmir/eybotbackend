import path from "path";
import crypto from "crypto";
import { IStorageProvider, UploadResult } from "../lib/storage/storage-provider.interface";
import { IStorageService } from "../lib/storage/storage-service.interface";
import { createStorageProvider } from "../lib/storage/storage-provider.factory";

/**
 * Sanitize a filename: strip directory components + replace unsafe chars.
 * Prevents path traversal (../../etc/passwd) and collisions.
 */
function sanitizeFileName(original: string): string {
  const base = path.basename(original);
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  const prefix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${safe}`;
}

export class StorageService implements IStorageService {
  private storageProvider: IStorageProvider;

  constructor(storageProvider?: IStorageProvider) {
    this.storageProvider = storageProvider ?? createStorageProvider();
  }

  async uploadFile(file: Express.Multer.File, folder = "uploads"): Promise<UploadResult> {
    console.log('[StorageService] uploadFile called, folder:', folder, 'file:', file.originalname);
    console.log('[StorageService] Provider:', this.storageProvider);
    try {
      const result = await this.storageProvider.upload({
        buffer: file.buffer,
        fileName: sanitizeFileName(file.originalname),
        mimeType: file.mimetype,
        folder,
      });
      console.log('[StorageService] uploadFile success:', result);
      return result;
    } catch (err) {
      console.error('[StorageService] uploadFile error:', err);
      throw err;
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    return this.storageProvider.delete(filePath);
  }

  async generateUploadUrl(
    fileName: string,
    contentType: string,
    folder: string,
  ): Promise<{ uploadUrl: string; fileUrl: string }> {
    console.log('[StorageService] generateUploadUrl called:', { fileName, contentType, folder });
    if (!this.storageProvider.getSignedUploadUrl) {
      throw new Error("Current storage provider does not support presigned upload URLs");
    }

    const safeName = sanitizeFileName(fileName);
    const filePath = `${folder}/${safeName}`;
    console.log('[StorageService] Sanitized path:', filePath);

    try {
      const { uploadUrl, fileUrl } = await this.storageProvider.getSignedUploadUrl(
        filePath,
        contentType,
      );
      console.log('[StorageService] generateUploadUrl success:', { uploadUrl: uploadUrl.substring(0, 80) + '...', fileUrl });
      return { uploadUrl, fileUrl };
    } catch (err) {
      console.error('[StorageService] generateUploadUrl error:', err);
      throw err;
    }
  }

  async getSignedUrl(filePath: string): Promise<string> {
    if (!this.storageProvider.getSignedUrl) {
      throw new Error("Current storage provider does not support signed URLs");
    }

    return this.storageProvider.getSignedUrl(filePath);
  }
}
