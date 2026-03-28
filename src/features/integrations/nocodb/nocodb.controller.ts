import { Request, Response } from 'express';
import { IPluginRegistry } from '../../../plugins/plugin.interface';
import { NocoDBIntegrationService } from '../../../plugins/nocodb/nocodb.service';
import { ICredentialService } from '../../credentials';

export class NocoDBController {
  private service: NocoDBIntegrationService;

  constructor(
    registry: IPluginRegistry,
    credentialsService: ICredentialService
  ) {
    this.service = new NocoDBIntegrationService(credentialsService, registry);
  }

  testConnection = async (req: Request, res: Response) => {
    try {
      const orgId = req.body.orgId || req.query.orgId;
      if (!orgId) {
        res.status(401).json({ error: 'Unauthorized: missing orgId' });
        return;
      }

      const credentialId = req.params.id;
      if (!credentialId) {
         res.status(400).json({ error: 'Missing credentialId' });
         return;
      }
      
      const result = await this.service.testCredential(
        Array.isArray(orgId) ? String(orgId[0]) : String(orgId),
        credentialId as string
      );
      
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
}
