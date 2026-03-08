import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IStorageProvider, UploadParams } from "../storage-provider.interface";
import { env } from "../../../config/env";

export class S3Provider implements IStorageProvider {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) { }

  public async upload({ buffer, fileName, mimeType, folder }: UploadParams) {
    const key = folder ? `${folder}/${fileName}` : fileName;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return {
      path: key,
      url: env.BASE_MEDIA_URL
        ? `${env.BASE_MEDIA_URL}/${key}`
        : `https://${this.bucket}.s3.amazonaws.com/${key}`,
    };
  }

  public async delete(filePath: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      }),
    );
  }

  public async getSignedUrl(filePath: string) {
    return awsGetSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: filePath }),
      { expiresIn: 3600 },
    );
  }

  public async getSignedUploadUrl(filePath: string, contentType: string) {
    const uploadUrl = await awsGetSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: filePath, ContentType: contentType }),
      { expiresIn: 900 }, // 15 minutes
    );

    return {
      uploadUrl,
      fileUrl: env.BASE_MEDIA_URL
        ? `${env.BASE_MEDIA_URL}/${filePath}`
        : `https://${this.bucket}.s3.amazonaws.com/${filePath}`,
    };
  }
}