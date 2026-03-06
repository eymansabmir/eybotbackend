import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../../../config/env";

let _client: S3Client | null = null;
let _bucket: string | null = null;

/** Lazy-initialized S3 client — only created when first accessed. */
export function getS3Client(): S3Client {
    if (!_client) {
        if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
            throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when using S3 provider");
        }

        _client = new S3Client({
            ...(env.AWS_REGION ? { region: env.AWS_REGION } : {}),
            credentials: {
                accessKeyId: env.AWS_ACCESS_KEY_ID,
                secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }

    return _client;
}

export function getS3Bucket(): string {
    if (!_bucket) {
        if (!env.AWS_S3_BUCKET) {
            throw new Error("AWS_S3_BUCKET is required when using S3 provider");
        }
        _bucket = env.AWS_S3_BUCKET;
    }
    return _bucket;
}
