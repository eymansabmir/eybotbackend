import { Request, Response, NextFunction } from "express";
import { IStorageService } from "../lib/storage/storage-service.interface";
import {
    UploadBodySchema,
    PresignedUrlQuerySchema,
    SignedUrlQuerySchema,
    DeleteFileBodySchema,
} from "../schemas/storage.schema";
import {
    FOLDER_SIZE_LIMITS,
    isAllowedMime,
    getSizeLimitMB,
} from "../lib/storage/storage.config";

export class StorageController {
    constructor(private readonly storageService: IStorageService) { }

    /**
     * POST /upload
     * Accepts a multipart file and streams it to the configured cloud provider.
     */
    uploadFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            console.log('[UPLOAD] uploadFile called');
            console.log('[UPLOAD] req.file:', req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : 'NO FILE');
            console.log('[UPLOAD] req.body:', req.body);

            if (!req.file) {
                res.status(400).json({ success: false, message: "File is required" });
                return;
            }

            const { folder } = UploadBodySchema.parse(req.body);
            console.log('[UPLOAD] Parsed folder:', folder);

            if (!isAllowedMime(folder, req.file.mimetype)) {
                console.log('[UPLOAD] Mime type not allowed:', req.file.mimetype, 'in folder:', folder);
                res.status(400).json({
                    success: false,
                    message: `File type "${req.file.mimetype}" is not allowed in folder "${folder}"`,
                });
                return;
            }

            if (req.file.size > FOLDER_SIZE_LIMITS[folder]) {
                console.log('[UPLOAD] File too large:', req.file.size, 'limit:', FOLDER_SIZE_LIMITS[folder]);
                res.status(400).json({
                    success: false,
                    message: `File exceeds the ${getSizeLimitMB(folder)} MB limit for folder "${folder}"`,
                });
                return;
            }

            console.log('[UPLOAD] Calling storageService.uploadFile...');
            const result = await this.storageService.uploadFile(req.file, folder);
            console.log('[UPLOAD] Upload success:', result);
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('[UPLOAD] Error in uploadFile:', error);
            next(error);
        }
    };

    /**
     * GET /presigned-url
     * Returns a presigned URL for client-side direct upload.
     */
    getPresignedUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            console.log('[PRESIGNED] getPresignedUrl called, query:', req.query);
            const { fileName, contentType, folder } = PresignedUrlQuerySchema.parse(req.query);
            console.log('[PRESIGNED] Parsed:', { fileName, contentType, folder });

            if (!isAllowedMime(folder, contentType)) {
                console.log('[PRESIGNED] Mime not allowed:', contentType, 'in folder:', folder);
                res.status(400).json({
                    success: false,
                    message: `Content type "${contentType}" is not allowed in folder "${folder}"`,
                });
                return;
            }

            console.log('[PRESIGNED] Calling storageService.generateUploadUrl...');
            const result = await this.storageService.generateUploadUrl(fileName, contentType, folder);
            console.log('[PRESIGNED] Success:', result);
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('[PRESIGNED] Error in getPresignedUrl:', error);
            next(error);
        }
    };

    /**
     * GET /signed-url
     * Returns a signed URL to access a private file.
     */
    getSignedUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { filePath } = SignedUrlQuerySchema.parse(req.query);
            const url = await this.storageService.getSignedUrl(filePath);
            res.json({ success: true, data: { url } });
        } catch (error) {
            next(error);
        }
    };

    /**
     * DELETE /file
     * Deletes a file from cloud storage.
     */
    deleteFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { filePath } = DeleteFileBodySchema.parse(req.body);
            await this.storageService.deleteFile(filePath);
            res.json({ success: true, message: "File deleted successfully" });
        } catch (error) {
            next(error);
        }
    };
}
