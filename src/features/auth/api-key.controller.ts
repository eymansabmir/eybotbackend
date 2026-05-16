import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { IApiKeyRepository } from './api-key.repository';

export class ApiKeyController {
  constructor(private readonly repository: IApiKeyRepository) {}

  /**
   * List all API keys for an organization
   */
  listKeys = async (req: Request, res: Response) => {
    const auth = (req as any).auth;
    const orgId = auth?.session?.user?.orgId || (req as any).user?.orgId;

    if (!orgId) {
      return res.status(401).json({ error: 'Unauthorized: No organization found' });
    }

    try {
      const keys = await this.repository.findAllByOrgId(orgId);
      
      // Filter sensitive data
      const safeKeys = keys.map(k => ({
        id: k.id,
        name: k.name,
        appId: k.appId,
        isActive: k.isActive,
        createdAt: k.createdAt,
      }));

      return res.status(200).json(safeKeys);
    } catch (error) {
      console.error('[ApiKeyController] Error listing keys:', error);
      return res.status(500).json({ error: 'Failed to fetch API keys' });
    }
  }

  /**
   * Create a new API key
   */
  createKey = async (req: Request, res: Response) => {
    const auth = (req as any).auth;
    const orgId = auth?.session?.user?.orgId || (req as any).user?.orgId;
    const { name } = req.body;

    if (!orgId) {
      return res.status(401).json({ error: 'Unauthorized: No organization found' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Key name is required' });
    }

    try {
      const appId = `roi_live_${crypto.randomBytes(8).toString('hex')}`;
      const appSecret = crypto.randomBytes(16).toString('hex');
      const appSecretHash = await bcrypt.hash(appSecret, 10);

      const apiKey = await this.repository.create({
        orgId,
        name,
        appId,
        appSecretHash,
      });

      // We return the PLAIN text secret ONLY once
      return res.status(201).json({
        id: apiKey.id,
        name: apiKey.name,
        appId: apiKey.appId,
        appSecret: appSecret, // Shared only once
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
      });
    } catch (error) {
      console.error('[ApiKeyController] Error creating key:', error);
      return res.status(500).json({ error: 'Failed to create API key' });
    }
  }

  /**
   * Revoke/Delete an API key
   */
  revokeKey = async (req: Request, res: Response) => {
    const auth = (req as any).auth;
    const orgId = auth?.session?.user?.orgId || (req as any).user?.orgId;
    const { id } = req.params;

    if (!orgId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      await this.repository.delete(id as string, orgId);
      return res.status(204).send();
    } catch (error) {
      console.error('[ApiKeyController] Error revoking key:', error);
      return res.status(500).json({ error: 'Failed to revoke API key' });
    }
  }
}

