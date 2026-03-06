import multer from "multer";
import { MAX_FILE_SIZE } from "../lib/storage/storage.config";

/**
 * Multer instance configured with memory storage.
 * File buffer goes directly to the cloud provider — no temp files on disk.
 */
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
});
