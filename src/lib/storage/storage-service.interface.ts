import { UploadResult } from "./storage-provider.interface";

export interface IStorageService {
  uploadFile(file: Express.Multer.File, folder?: string): Promise<UploadResult>;
  deleteFile(filePath: string): Promise<void>;
  generateUploadUrl(fileName: string, contentType: string, folder: string): Promise<{ uploadUrl: string; fileUrl: string }>;
  getSignedUrl(filePath: string): Promise<string>;
}