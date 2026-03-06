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

export interface SignedUploadUrlResult {
  uploadUrl: string;
  fileUrl: string;
}

export interface IStorageProvider {
  upload(params: UploadParams): Promise<UploadResult>;
  delete(filePath: string): Promise<void>;
  getSignedUrl?(filePath: string): Promise<string>;
  getSignedUploadUrl?(filePath: string, contentType: string): Promise<SignedUploadUrlResult>;
}