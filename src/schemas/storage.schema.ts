import { z } from "zod";
import { ALLOWED_PURPOSES } from "../plugins/storage/storage.config";

/** Schema for POST /upload body (purpose field from multipart form) */
export const UploadBodySchema = z.object({
    purpose: z.enum(ALLOWED_PURPOSES).default("general"),
});

/** Schema for GET /upload-policy query */
export const UploadPolicyQuerySchema = z.object({
    purpose: z.enum(ALLOWED_PURPOSES),
});

/** Schema for GET /presigned-url query */
export const PresignedUrlQuerySchema = z.object({
    fileName: z.string().min(1, "fileName is required"),
    contentType: z.string().min(1, "contentType is required"),
    purpose: z.enum(ALLOWED_PURPOSES),
});

/** Schema for GET /signed-url query */
export const SignedUrlQuerySchema = z.object({
    filePath: z.string().min(1, "filePath is required"),
});

/** Schema for DELETE /file body */
export const DeleteFileBodySchema = z.object({
    filePath: z.string().min(1, "filePath is required"),
});

/** Schema for GET /resolve-url query */
export const ResolveUrlQuerySchema = z.object({
  filePath: z.string().min(1),
  bucket: z.enum(['public', 'private']).default('public'),
});

export const ValidateMediaUrlSchema = z.object({
  url: z.string().url(),
  purpose: z.enum(['image', 'video', 'audio', 'document', 'sticker']),
});
