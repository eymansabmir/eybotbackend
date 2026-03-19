import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp/whatsapp.interface';

const UploadMediaSchema = z.object({
  url: z.string().url(),
  type: z.enum(['image', 'video', 'audio', 'document', 'sticker']),
});

export class WhatsAppController {
  constructor(private readonly whatsappPlugin: IWhatsAppPlugin) {}

  uploadMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { url, type } = UploadMediaSchema.parse(req.body);
      const mediaId = await this.whatsappPlugin.sender.uploadMedia(url, type);
      res.json({ success: true, mediaId });
    } catch (err) { next(err); }
  };
}
