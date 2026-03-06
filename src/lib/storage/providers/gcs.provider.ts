import { IStorageProvider, UploadParams } from "../storage-provider.interface";
import { getGcsBucket } from "../clients/gcs.client";

export const createGCSProvider = (): IStorageProvider => {
  console.log('[GCS] createGCSProvider called');

  const upload = async ({ buffer, fileName, mimeType, folder }: UploadParams) => {
    console.log('[GCS] upload called:', { fileName, mimeType, folder, bufferSize: buffer.length });
    try {
      const bucket = getGcsBucket();
      console.log('[GCS] Bucket name:', bucket.name);
      const path = folder ? `${folder}/${fileName}` : fileName;
      const file = bucket.file(path);

      await file.save(buffer, {
        metadata: { contentType: mimeType },
      });

      const url = `https://storage.googleapis.com/${bucket.name}/${path}`;
      console.log('[GCS] upload success, url:', url);
      return { path, url };
    } catch (err) {
      console.error('[GCS] upload error:', err);
      throw err;
    }
  };

  const deleteFile = async (filePath: string) => {
    const bucket = getGcsBucket();
    await bucket.file(filePath).delete();
  };

  const getSignedUrl = async (filePath: string) => {
    const bucket = getGcsBucket();
    const [url] = await bucket.file(filePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 3600 * 1000,
    });

    return url;
  };

  const getSignedUploadUrl = async (filePath: string, contentType: string) => {
    console.log('[GCS] getSignedUploadUrl called:', { filePath, contentType });
    try {
      const bucket = getGcsBucket();
      console.log('[GCS] Bucket name:', bucket.name);
      const [uploadUrl] = await bucket.file(filePath).getSignedUrl({
        action: "write",
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
      });

      console.log('[GCS] getSignedUploadUrl success');
      return {
        uploadUrl,
        fileUrl: `https://storage.googleapis.com/${bucket.name}/${filePath}`,
      };
    } catch (err) {
      console.error('[GCS] getSignedUploadUrl error:', err);
      throw err;
    }
  };

  return { upload, delete: deleteFile, getSignedUrl, getSignedUploadUrl };
};