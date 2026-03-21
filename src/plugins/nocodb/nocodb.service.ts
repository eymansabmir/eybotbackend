import type { IPluginRegistry } from '../plugin.interface';
import type { ICredentialService } from '../../features/credentials';
import type { INocoDBPlugin } from './nocodb.interface';
import type {
  NocoDBCredentialMaterial,
  NocoDBTestResult,
} from './nocodb.types';
import { AppError } from '../../utils/errors';
import type { NocoDBNodeRequest } from '../engine/node-executor';

export interface INocoDBIntegrationService {
  testCredential(orgId: string, credentialId: string): Promise<NocoDBTestResult>;
  executeNode(input: {
    orgId: string;
    credentialId: string;
    action: NocoDBNodeRequest['action'];
    tableId: string;
    viewId?: string;
    filter?: string;
    returnType?: 'All' | 'First' | 'Last' | 'Random';
    fields?: Array<{ key: string; value: string }>;
    timeoutMs?: number;
    responseMapping?: NocoDBNodeRequest['responseMapping'];
  }): Promise<{ mappedMutations: Array<{ scope: 'session' | 'contact'; key: string; value: unknown }> }>;
}

export class NocoDBIntegrationService implements INocoDBIntegrationService {
  constructor(
    private readonly credentials: ICredentialService,
    private readonly registry: IPluginRegistry
  ) {}

  private get plugin(): INocoDBPlugin {
    return this.registry.get<INocoDBPlugin>('nocodb');
  }

  private async fetchCredentialMaterial(orgId: string, credentialId: string): Promise<NocoDBCredentialMaterial> {
    const secret = await this.credentials.decryptSecret(orgId, credentialId, 'NOCODB' as any);
    
    // Support the format created by the API
    if (secret['tokens']) {
      // Not using OAuth for nocodb right now, but just in case
      return secret['tokens'] as any;
    }

    if (typeof secret['baseUrl'] !== 'string' || typeof secret['apiKey'] !== 'string') {
      throw new AppError('NocoDB credential payload is invalid', 400);
    }

    return {
      baseUrl: secret['baseUrl'],
      apiKey: secret['apiKey'],
    };
  }

  async testCredential(orgId: string, credentialId: string): Promise<NocoDBTestResult> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    const result = await this.plugin.testConnection({ credential: cred });
    if (result.ok) {
       await this.credentials.markTested(orgId, credentialId);
    }
    return result;
  }

  async executeNode(input: {
    orgId: string;
    credentialId: string;
    action: NocoDBNodeRequest['action'];
    tableId: string;
    viewId?: string;
    filter?: string;
    returnType?: 'All' | 'First' | 'Last' | 'Random';
    fields?: Array<{ key: string; value: string }>;
    timeoutMs?: number;
    responseMapping?: NocoDBNodeRequest['responseMapping'];
  }): Promise<{ mappedMutations: Array<{ scope: 'session' | 'contact'; key: string; value: unknown }> }> {
    const cred = await this.fetchCredentialMaterial(input.orgId, input.credentialId);
    
    let resultPayload: any = null;

    if (input.action === 'create_record') {
      const result = await this.plugin.createRecord({
        credential: cred,
        tableId: input.tableId,
        fields: input.fields || [],
      });
      resultPayload = result;
    } else if (input.action === 'update_record') {
      const result = await this.plugin.updateRecord({
        credential: cred,
        tableId: input.tableId,
        viewId: input.viewId,
        filter: input.filter,
        fields: input.fields || [],
      });
      resultPayload = result;
    } else if (input.action === 'search_records') {
      const result = await this.plugin.searchRecords({
        credential: cred,
        tableId: input.tableId,
        viewId: input.viewId,
        filter: input.filter,
        returnType: input.returnType,
        fields: input.fields || [],
      });
      // Flatten the payload slightly so mapping is easier
      resultPayload = {
        success: result.success,
        firstRow: result.rows.length > 0 ? result.rows[0]?.values : null,
        lastRow: result.rows.length > 0 ? result.rows[result.rows.length - 1]?.values : null,
        rowsLength: result.rows.length,
        rows: result.rows.map(r => r.values),
      };
    } else {
      throw new Error(`Unsupported NocoDB action: ${input.action}`);
    }

    const mutations: Array<{ scope: 'session' | 'contact'; key: string; value: unknown }> = [];
    
    if (input.responseMapping) {
      for (const mapping of input.responseMapping) {
        if (!mapping.variableName || !mapping.jsonPath) continue;
        
        // Simple dot notation extraction
        const value = mapping.jsonPath.split('.').reduce((acc: any, part: string) => {
           if (acc == null) return acc;
           return acc[part];
        }, resultPayload);

        if (value !== undefined) {
           mutations.push({
             scope: mapping.scope,
             key: mapping.variableName,
             value,
           });
        }
      }
    }

    return { mappedMutations: mutations };
  }
}
