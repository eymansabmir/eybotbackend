import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiAuthService } from './api-auth.service';

const tokenRequestSchema = z.object({
  appId: z.string().min(1, 'appId is required'),
  appSecret: z.string().min(1, 'appSecret is required'),
});

export class AuthController {
  constructor(private readonly authService: ApiAuthService) {}

  /**
   * POST /v1/auth/token
   * Generates a temporary access token for the client.
   */
  generateToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Validate Input
      const validation = tokenRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ 
          error: 'Invalid request', 
          details: validation.error.format() 
        });
        return;
      }

      const { appId, appSecret } = validation.data;

      // 2. Generate Token via Service
      const result = await this.authService.generateToken(appId, appSecret);

      // 3. Return Standard Response
      res.json(result);
    } catch (error: any) {
      // We use 401 for all auth failures to avoid leaking if appId exists
      res.status(401).json({ error: error.message || 'Authentication failed' });
    }
  };
}
