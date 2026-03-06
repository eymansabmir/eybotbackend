import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IStorageProvider, UploadParams } from "../storage-provider.interface";
import { getS3Client, getS3Bucket } from "../clients/s3.client";

export const createS3Provider = (): IStorageProvider => {

  const upload = async ({ buffer, fileName, mimeType, folder }: UploadParams) => {
    const client = getS3Client();
    const bucket = getS3Bucket();
    const key = folder ? `${folder}/${fileName}` : fileName;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return {
      path: key,
      url: `https://${bucket}.s3.amazonaws.com/${key}`,
    };
  };

  const deleteFile = async (filePath: string) => {
    const client = getS3Client();
    const bucket = getS3Bucket();

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: filePath,
      }),
    );
  };

  const getSignedUrl = async (filePath: string) => {
    const client = getS3Client();
    const bucket = getS3Bucket();

    return awsGetSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: filePath }),
      { expiresIn: 3600 },
    );
  };

  const getSignedUploadUrl = async (filePath: string, contentType: string) => {
    const client = getS3Client();
    const bucket = getS3Bucket();

    const uploadUrl = await awsGetSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: filePath, ContentType: contentType }),
      { expiresIn: 900 }, // 15 minutes
    );

    return {
      uploadUrl,
      fileUrl: `https://${bucket}.s3.amazonaws.com/${filePath}`,
    };
  };

  return { upload, delete: deleteFile, getSignedUrl, getSignedUploadUrl };
};