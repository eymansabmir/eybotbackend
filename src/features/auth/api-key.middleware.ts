import { Request, Response, NextFunction } from 'express';
import { ApiAuthService } from './api-auth.service';

export const createApiKeyMiddleware = (authService: ApiAuthService) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Get Token from Header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header. Use Bearer <token>' });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Invalid Authorization header format. Use Bearer <token>' });
      return;
    }

    try {
      // 2. Verify Token
      const decoded = authService.verifyToken(token);

      // 3. Inject Auth Info into Request
      // We mimic the structure used by other auth middlewares to maintain compatibility
      (req as any).auth = {
        session: {
          user: {
            id: decoded.sub,
            orgId: decoded.orgId,
            appId: decoded.appId
          }
        },
        type: 'api_key'
      };

      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired access token' });
    }
  };
};
