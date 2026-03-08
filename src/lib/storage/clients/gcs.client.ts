import { Storage } from "@google-cloud/storage";
import { env } from "../../../config/env";

let _bucket: ReturnType<Storage["bucket"]> | null = null;

/** Lazy-initialized GCS bucket — only created when first accessed. */
export function getGcsBucket() {
    if (!_bucket) {
        const storage = new Storage({
            ...(env.GCS_PROJECT_ID ? { projectId: env.GCS_PROJECT_ID } : {}),
            ...(env.GCS_KEY_FILE ? { keyFilename: env.GCS_KEY_FILE } : {}),
        });

        const bucketName = env.GCS_BUCKET_NAME;
        if (!bucketName) {
            throw new Error("GCS_BUCKET_NAME is required when using GCS provider");
        }

        _bucket = storage.bucket(bucketName);
    }

    return _bucket;
}
