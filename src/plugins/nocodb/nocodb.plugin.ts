import { AppError } from '../../utils/errors';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { INocoDBPlugin } from './nocodb.interface';
import type {
  NocoDBCredentialMaterial,
  NocoDBTestResult,
  NocoDBInsertRowInput,
  NocoDBInsertResult,
  NocoDBUpdateRowInput,
  NocoDBUpdateResult,
  NocoDBSearchRecordsInput,
  NocoDBSearchResult,
} from './nocodb.types';

export class NocoDBProviderError extends AppError {
  constructor(message: string, statusCode: number = 502) {
    super(message, statusCode);
  }
}

export class NocoDBPlugin implements IPlugin, INocoDBPlugin {
  readonly name = 'nocodb';

  async initialize(_registry: IPluginRegistry): Promise<void> {}
  async shutdown(): Promise<void> {}

  async testConnection(input: { credential: NocoDBCredentialMaterial; timeoutMs?: number }): Promise<NocoDBTestResult> {
    const startedAt = Date.now();
    try {
      // In NocoDB, a simple ping could be fetching the base/table meta or self token info.
      // But standard open REST api requires checking something like the tables list or user info.
      // Actually, just calling a GET to `/api/v2/meta/bases` if we are hitting API, or `/api/v1/auth/user/me`.
      // The easiest generic call with xc-token that tests validity is just requesting a non-existent table or hitting the base info.
      // As a fallback, we can just fetch an empty table query if base is not provided.
      // Since autobot doesn't have a test endpoint explicitly, we do a basic reachability check here.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), input.timeoutMs || 10000);

      const response = await fetch(`${input.credential.baseUrl}/api/v1/health`, {
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`Failed to reach NocoDB at ${input.credential.baseUrl}`);
      }

      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        statusCode: err.status || 502,
        errorCode: 'auth_error',
        errorMessage: err.message || 'Connection failed',
      };
    }
  }

  private parseFields(fields: Array<{ key: string; value: string }>): Record<string, string> {
    const json: Record<string, string> = {};
    for (const field of fields) {
      if (!field.key) continue;
      json[field.key] = field.value;
    }
    return json;
  }

  async createRecord(input: NocoDBInsertRowInput): Promise<NocoDBInsertResult> {
    try {
      const response = await fetch(
        `${input.credential.baseUrl}/api/v2/tables/${input.tableId}/records`,
        {
          method: 'POST',
          headers: {
            'xc-token': input.credential.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.parseFields(input.fields)),
        }
      );

      if (!response.ok) {
        throw new NocoDBProviderError(`Failed to create record: ${await response.text()}`, response.status);
      }

      const data = await response.json() as { Id: string | number };
      return { success: true, recordId: data.Id };
    } catch (err: any) {
      if (err instanceof NocoDBProviderError) throw err;
      throw new NocoDBProviderError(err.message || 'Failed to create record');
    }
  }

  async updateRecord(input: NocoDBUpdateRowInput): Promise<NocoDBUpdateResult> {
    try {
      const response = await fetch(
        `${input.credential.baseUrl}/api/v2/tables/${input.tableId}/records`,
        {
          method: 'PATCH',
          headers: {
            'xc-token': input.credential.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Id: input.rowId,
            ...this.parseFields(input.fields)
          }),
        }
      );

      if (!response.ok) {
        throw new NocoDBProviderError(`Failed to update record: ${await response.text()}`, response.status);
      }

      return { success: true };
    } catch (err: any) {
      if (err instanceof NocoDBProviderError) throw err;
      throw new NocoDBProviderError(err.message || 'Failed to update record');
    }
  }

  async searchRecords(input: NocoDBSearchRecordsInput): Promise<NocoDBSearchResult> {
    try {
      // Build nocodb where clause
      // Autobot logic: filter conditions where key = value. 
      // NocoDB where string format: (key,eq,value)~and~(key,eq,value)
      const conditions = input.fields
        .filter(f => f.key)
        .map(f => `(${f.key},eq,${f.value})`);
      
      const whereClause = conditions.length > 0 ? conditions.join('~and~') : '';
      const url = new URL(`${input.credential.baseUrl}/api/v2/tables/${input.tableId}/records`);
      if (whereClause) {
        url.searchParams.append('where', whereClause);
      }
      url.searchParams.append('limit', '100'); // Some reasonable limit

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'xc-token': input.credential.apiKey,
        },
      });

      if (!response.ok) {
        throw new NocoDBProviderError(`Failed to search records: ${await response.text()}`, response.status);
      }

      const data = await response.json() as { list: any[] };
      const rows = (data.list || []).map(r => ({
        id: r.Id,
        values: r,
      }));

      return { success: true, rows };
    } catch (err: any) {
      if (err instanceof NocoDBProviderError) throw err;
      throw new NocoDBProviderError(err.message || 'Failed to search records');
    }
  }
}
