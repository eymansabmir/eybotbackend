import { z } from "zod";
import { ALLOWED_FOLDERS } from "../plugins/storage/storage.config";

/** Schema for POST /upload body (folder field from multipart form) */
export const UploadBodySchema = z.object({
    folder: z.enum(ALLOWED_FOLDERS).default("uploads"),
});

/** Schema for GET /presigned-url query */
export const PresignedUrlQuerySchema = z.object({
    fileName: z.string().min(1, "fileName is required"),
    contentType: z.string().min(1, "contentType is required"),
    folder: z.enum(ALLOWED_FOLDERS),
});

/** Schema for GET /signed-url query */
export const SignedUrlQuerySchema = z.object({
    filePath: z.string().min(1, "filePath is required"),
});

/** Schema for DELETE /file body */
export const DeleteFileBodySchema = z.object({
    filePath: z.string().min(1, "filePath is required"),
});
