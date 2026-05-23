import { Request, Response, NextFunction } from 'express';
import type { IStoragePlugin } from '../../plugins/storage';
import {
  UploadBodySchema,
  UploadPolicyQuerySchema,
  PresignedUrlQuerySchema,
  SignedUrlQuerySchema,
  DeleteFileBodySchema,
  ResolveUrlQuerySchema,
} from '../../schemas/storage.schema';
import { 
  isAllowedMime, 
  PURPOSE_TO_FOLDER, 
  getUploadPolicy 
} from '../../plugins/storage/storage.config';
import { ValidateMediaUrlSchema } from '../../schemas/storage.schema';

export class StorageController {
  constructor(private readonly storagePlugin: IStoragePlugin) {}

  validateMediaUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { url, purpose } = ValidateMediaUrlSchema.parse(req.query);
      const policy = getUploadPolicy(purpose);
      
      const response = await fetch(url, { method: 'HEAD' }).catch(() => null);
      
      const handleResponse = (resp: Response | any) => {
        const contentLength = resp.headers.get('content-length');
        if (contentLength) {
          const sizeMB = parseInt(contentLength, 10) / (1024 * 1024);
          if (sizeMB > policy.maxSizeMB) {
            return { isValid: false, message: `${purpose.charAt(0).toUpperCase() + purpose.slice(1)} exceeds the ${policy.maxSizeMB} MB limit` };
          }
        }
        return { isValid: true };
      };

      if (!response || !response.ok) {
        const getResponse = await fetch(url, { method: 'GET' }).catch(() => null);
        if (!getResponse || !getResponse.ok) {
            res.json({ success: false, message: 'URL is unreachable or invalid' });
            return;
        }
        const validation = handleResponse(getResponse);
        res.json({ success: validation.isValid, message: validation.message });
        return;
      }

      const validation = handleResponse(response);
      res.json({ success: validation.isValid, message: validation.message });
    } catch (err) { next(err); }
  };

  resolveUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filePath, bucket } = ResolveUrlQuerySchema.parse(req.query);
      const url = await this.storagePlugin.resolveUrl(filePath, bucket);
      res.json({ success: true, data: { url } });
    } catch (err) { next(err); }
  };

  getUploadPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { purpose } = UploadPolicyQuerySchema.parse(req.query);
      const policy = getUploadPolicy(purpose);
      res.json({ success: true, data: policy });
    } catch (err) { next(err); }
  };

  uploadFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'File is required' });
        return;
      }
      const { purpose } = UploadBodySchema.parse(req.body);
      const policy = getUploadPolicy(purpose);
      const folder = PURPOSE_TO_FOLDER[purpose];

      if (!isAllowedMime(folder, req.file.mimetype)) {
        res.status(400).json({ success: false, message: `File type "${req.file.mimetype}" is not allowed for purpose "${purpose}"` });
        return;
      }
      const sizeMB = req.file.size / (1024 * 1024);
      if (sizeMB > policy.maxSizeMB) {
        res.status(400).json({ success: false, message: `File exceeds the ${policy.maxSizeMB} MB limit for purpose "${purpose}"` });
        return;
      }
      const result = await this.storagePlugin.uploadFile(req.file, folder);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  };

  getPresignedUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileName, contentType, purpose } = PresignedUrlQuerySchema.parse(req.query);
      const folder = PURPOSE_TO_FOLDER[purpose];

      if (!isAllowedMime(folder, contentType)) {
        res.status(400).json({ success: false, message: `Content type "${contentType}" is not allowed for purpose "${purpose}"` });
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
