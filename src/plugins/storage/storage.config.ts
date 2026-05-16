export const ALLOWED_FOLDERS = ['campaigns', 'bot-media', 'workspaces', 'uploads', 'stickers'] as const;
export type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

export const ALLOWED_PURPOSES = ['image', 'video', 'audio', 'document', 'sticker', 'campaign_csv', 'general'] as const;
export type UploadPurpose = (typeof ALLOWED_PURPOSES)[number];

export const PURPOSE_TO_FOLDER: Record<UploadPurpose, AllowedFolder> = {
  image: 'bot-media',
  video: 'bot-media',
  audio: 'bot-media',
  document: 'bot-media',
  sticker: 'stickers',
  campaign_csv: 'campaigns',
  general: 'uploads',
};

export const FOLDER_MIME_MAP: Record<AllowedFolder, readonly string[]> = {
  campaigns: [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ],
  'bot-media': [
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/3gpp',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/mp4', 'audio/amr',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
  stickers: [
    'image/webp',
  ],
  workspaces: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/ogg', 'audio/wav',
    'application/pdf',
    'application/zip',
  ],
  uploads: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
    'audio/mpeg', 'audio/ogg', 'audio/wav',
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/zip',
  ],
};

export const FOLDER_SIZE_LIMITS: Record<AllowedFolder, number> = {
  campaigns: 50 * 1024 * 1024,    // 50 MB
  'bot-media': 100 * 1024 * 1024, // 100 MB (General limit, specific nodes check client-side)
  stickers: 100 * 1024,           // 100 KB
  workspaces: 100 * 1024 * 1024,  // 100 MB
  uploads: 100 * 1024 * 1024,     // 100 MB
};

/** Hard cap passed to Multer — per-folder check happens in the controller. */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

export function isAllowedMime(folder: AllowedFolder, mimeType: string): boolean {
  return FOLDER_MIME_MAP[folder].includes(mimeType);
}

export function getSizeLimitMB(folder: AllowedFolder): number {
  return FOLDER_SIZE_LIMITS[folder] / (1024 * 1024);
}

export function getUploadPolicy(purpose: UploadPurpose) {
  const folder = PURPOSE_TO_FOLDER[purpose];
  const mimes = FOLDER_MIME_MAP[folder];
  
  // Refine mimes and size limits based on purpose
  let filteredMimes = [...mimes];
  let maxSizeMB = getSizeLimitMB(folder);

  if (purpose === 'image') {
      filteredMimes = mimes.filter(m => m.startsWith('image/'));
      maxSizeMB = 5;
  } else if (purpose === 'video') {
      filteredMimes = mimes.filter(m => m.startsWith('video/'));
      maxSizeMB = 16;
  } else if (purpose === 'audio') {
      filteredMimes = mimes.filter(m => m.startsWith('audio/'));
      maxSizeMB = 16;
  } else if (purpose === 'document') {
      filteredMimes = mimes.filter(m => !m.startsWith('image/') && !m.startsWith('video/') && !m.startsWith('audio/'));
      maxSizeMB = 100;
  } else if (purpose === 'sticker') {
      maxSizeMB = 0.1; // 100 KB
  }

  return {
    allowedMimeTypes: filteredMimes,
    maxSizeMB: maxSizeMB,
    acceptString: filteredMimes.join(','),
  };
}
