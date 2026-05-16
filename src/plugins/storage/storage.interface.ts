export const STORAGE_PLUGIN = 'storage' as const;

export interface UploadParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folder?: string;
}

export interface UploadResult {
  path: string;
  url: string;
}

export interface IStoragePlugin {
  uploadFile(file: Express.Multer.File, folder?: string): Promise<UploadResult>;
  deleteFile(filePath: string): Promise<void>;
  generateUploadUrl(
    fileName: string,
    contentType: string,
    folder: string,
  ): Promise<{ uploadUrl: string; fileUrl: string }>;
  getSignedUrl(filePath: string): Promise<string>;
  resolveUrl(filePath: string, bucket?: 'public' | 'private'): Promise<string>;
  downloadFile(filePath: string): Promise<Buffer>;
  getReadStream(filePath: string): Promise<NodeJS.ReadableStream>;
}
