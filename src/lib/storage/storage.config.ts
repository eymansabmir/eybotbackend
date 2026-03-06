/**
 * Storage Configuration
 *
 * Single source of truth for storage policies.
 * To support a new folder or file type, edit ONLY this file.
 */

export const ALLOWED_FOLDERS = ["campaigns", "bot-media", "workspaces", "uploads"] as const;

export type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

/** MIME types accepted per folder */
export const FOLDER_MIME_MAP: Record<AllowedFolder, readonly string[]> = {
    campaigns: [
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    ],
    "bot-media": [
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "video/mp4", "video/webm",
        "audio/mpeg", "audio/ogg", "audio/wav",
        "application/pdf",
    ],
    workspaces: [
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "video/mp4", "video/webm",
        "audio/mpeg", "audio/ogg", "audio/wav",
        "application/pdf",
        "application/zip",
    ],
    uploads: [
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "video/mp4", "video/webm",
        "audio/mpeg", "audio/ogg", "audio/wav",
        "application/pdf",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/zip",
    ],
};

/** Max file size in bytes per folder */
export const FOLDER_SIZE_LIMITS: Record<AllowedFolder, number> = {
    campaigns: 50 * 1024 * 1024,   // 50 MB
    "bot-media": 100 * 1024 * 1024, // 100 MB
    workspaces: 100 * 1024 * 1024,  // 100 MB
    uploads: 100 * 1024 * 1024,  // 100 MB
};

/** Hard cap passed to multer (the per-folder check happens in the controller) */
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Check whether a MIME type is allowed in a given folder */
export function isAllowedMime(folder: AllowedFolder, mimeType: string): boolean {
    return FOLDER_MIME_MAP[folder].includes(mimeType);
}

/** Return the human-readable size limit for a folder */
export function getSizeLimitMB(folder: AllowedFolder): number {
    return FOLDER_SIZE_LIMITS[folder] / (1024 * 1024);
}
