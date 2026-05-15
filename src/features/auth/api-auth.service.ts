import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

export class ApiAuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
  private readonly TOKEN_EXPIRY = '1h'; // 1 hour

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generates a new access token for valid appId/appSecret pair.
   */
  async generateToken(appId: string, appSecret: string): Promise<TokenResponse> {
    // 1. Find the API Key record
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { appId, isActive: true }
    });

    if (!apiKey) {
      throw new Error('Invalid App ID or inactive account');
    }

    // 2. Verify the secret against the hash
    const isValid = await bcrypt.compare(appSecret, apiKey.appSecretHash);
    if (!isValid) {
      throw new Error('Invalid App Secret');
    }

    // 3. Generate JWT
    const payload = {
      sub: apiKey.id,
      orgId: apiKey.orgId,
      appId: apiKey.appId,
      type: 'api_access'
    };

    const token = jwt.sign(payload, this.JWT_SECRET, { expiresIn: this.TOKEN_EXPIRY });

    return {
      accessToken: token,
      expiresIn: 3600, // 1 hour in seconds
      tokenType: 'Bearer'
    };
  }

  /**
   * Validates a JWT and returns the decoded payload.
   */
  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.JWT_SECRET);
    } catch (err) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Helper to hash an app secret (for when you create new keys)
   */
  async hashSecret(secret: string): Promise<string> {
    return bcrypt.hash(secret, 10);
  }
}
