import { Request, Response, NextFunction } from 'express';
import type { IStoragePlugin } from '../../plugins/storage';
import {
  UploadBodySchema,
  PresignedUrlQuerySchema,
  SignedUrlQuerySchema,
  DeleteFileBodySchema,
} from '../../schemas/storage.schema';
import { isAllowedMime, getSizeLimitMB, FOLDER_SIZE_LIMITS } from '../../plugins/storage/storage.config';

export class StorageController {
  constructor(private readonly storagePlugin: IStoragePlugin) {}

  uploadFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'File is required' });
        return;
      }
      const { folder } = UploadBodySchema.parse(req.body);
      if (!isAllowedMime(folder, req.file.mimetype)) {
        res.status(400).json({ success: false, message: `File type "${req.file.mimetype}" is not allowed in folder "${folder}"` });
        return;
      }
      if (req.file.size > FOLDER_SIZE_LIMITS[folder]) {
        res.status(400).json({ success: false, message: `File exceeds the ${getSizeLimitMB(folder)} MB limit for folder "${folder}"` });
        return;
      }
      const result = await this.storagePlugin.uploadFile(req.file, folder);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  };

  getPresignedUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileName, contentType, folder } = PresignedUrlQuerySchema.parse(req.query);
      if (!isAllowedMime(folder, contentType)) {
        res.status(400).json({ success: false, message: `Content type "${contentType}" is not allowed in folder "${folder}"` });
        return;
      }
      const result = await this.storagePlugin.generateUploadUrl(fileName, contentType, folder);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  };

  getSignedUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filePath } = SignedUrlQuerySchema.parse(req.query);
      const url = await this.storagePlugin.getSignedUrl(filePath);
      res.json({ success: true, data: { url } });
    } catch (err) { next(err); }
  };

  deleteFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filePath } = DeleteFileBodySchema.parse(req.body);
      await this.storagePlugin.deleteFile(filePath);
      res.json({ success: true, message: 'File deleted successfully' });
    } catch (err) { next(err); }
  };
}
