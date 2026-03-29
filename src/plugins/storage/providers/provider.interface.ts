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

export interface IStorageProvider {
  upload(params: UploadParams): Promise<UploadResult>;
  delete(filePath: string): Promise<void>;
  getSignedUrl?(filePath: string): Promise<string>;
  getPublicUrl(filePath: string): string;
  getSignedUploadUrl?(
    filePath: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; fileUrl: string }>;
  download(filePath: string): Promise<Buffer>;
}
