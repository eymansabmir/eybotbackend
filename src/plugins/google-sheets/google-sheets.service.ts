import { IPluginRegistry } from '../plugin.interface';
import { IGoogleSheetsPlugin, IGoogleSheetsIntegrationService } from './google-sheets.interface';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import type { ICredentialService } from '../../features/credentials';
import {
  GoogleSheetsCredentialMaterial,
  GoogleSheetsInsertResult,
  GoogleSheetsUpdateResult,
  GoogleSheetsGetResult,
  GoogleSheetsGetRowInput,
  GoogleSheetsInsertRowInput,
  GoogleSheetsUpdateRowInput,
  GoogleSpreadsheetInfo,
  GoogleSheetInfo,
  GoogleSheetsTestResult,
  ExecuteGoogleSheetsNodePayload,
  ExecuteGoogleSheetsNodeResult,
  ExecuteGoogleSheetsMappedMutation,
} from './google-sheets.types';
import { AppError } from '../../utils/errors';

export class GoogleSheetsIntegrationService implements IGoogleSheetsIntegrationService {
  constructor(
    private readonly credentials: ICredentialService,
    private readonly registry: IPluginRegistry
  ) {}

  private get plugin(): IGoogleSheetsPlugin {
    return this.registry.get<IGoogleSheetsPlugin>('google-sheets');
  }

  private async fetchCredentialMaterial(orgId: string, credentialId: string): Promise<GoogleSheetsCredentialMaterial> {
    const secret = await this.credentials.decryptSecret(orgId, credentialId, 'GOOGLE_SHEETS' as any);
    
    if (secret['tokens']) {
      return { tokens: secret['tokens'] };
    }

    if (typeof secret['clientEmail'] !== 'string' || typeof secret['privateKey'] !== 'string') {
      throw new AppError('Google Sheets credential payload is invalid', 400);
    }

    return {
      clientEmail: secret['clientEmail'],
      privateKey: secret['privateKey'],
    };
  }

  async testCredential(orgId: string, credentialId: string): Promise<GoogleSheetsTestResult> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    const result = await this.plugin.testConnection({ credential: cred });
    if (result.ok) {
       await this.credentials.markTested(orgId, credentialId);
    }
    return result;
  }

  async listSpreadsheets(orgId: string, credentialId: string): Promise<GoogleSpreadsheetInfo[]> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    return this.plugin.listSpreadsheets({ credential: cred });
  }

  async listSheets(orgId: string, credentialId: string, spreadsheetId: string): Promise<GoogleSheetInfo[]> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    return this.plugin.listSheets({ credential: cred, spreadsheetId });
  }

  async insertRow(orgId: string, credentialId: string, payload: Omit<GoogleSheetsInsertRowInput, 'credential'>): Promise<GoogleSheetsInsertResult> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    return this.plugin.insertRow({ credential: cred, ...payload });
  }

  async updateRow(orgId: string, credentialId: string, payload: Omit<GoogleSheetsUpdateRowInput, 'credential'>): Promise<GoogleSheetsUpdateResult> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    return this.plugin.updateRow({ credential: cred, ...payload });
  }

  async getRow(orgId: string, credentialId: string, payload: Omit<GoogleSheetsGetRowInput, 'credential'>): Promise<GoogleSheetsGetResult> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    return this.plugin.getRow({ credential: cred, ...payload });
  }

  async getColumns(orgId: string, credentialId: string, spreadsheetId: string, sheetId: string): Promise<string[]> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    return this.plugin.getColumns({ credential: cred, spreadsheetId, sheetId });
  }

  getAuthUrl(orgId: string): string {
    const oAuth2Client = new OAuth2Client(
      env.GOOGLE_SHEETS_CLIENT_ID,
      env.GOOGLE_SHEETS_CLIENT_SECRET,
      `${env.BETTER_AUTH_URL}/api/integrations/google-sheets/auth/callback`
    );

    return oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state: orgId,
    });
  }

  async handleAuthCallback(orgId: string, code: string): Promise<void> {
    const oAuth2Client = new OAuth2Client(
      env.GOOGLE_SHEETS_CLIENT_ID,
      env.GOOGLE_SHEETS_CLIENT_SECRET,
      `${env.BETTER_AUTH_URL}/api/integrations/google-sheets/auth/callback`
    );

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    try {
      const response = await oAuth2Client.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
      const email = (response.data as any).email || 'Google Sheets User';

      await this.credentials.createCredential({
        orgId,
        name: email,
        type: 'GOOGLE_SHEETS' as any,
        secret: { tokens },
      });
    } catch (error) {
       console.error("Failed to fetch userinfo during Google Sheets auth", error);
       // Fallback name if unable to get email
       await this.credentials.createCredential({
        orgId,
        name: 'Google Sheets Account',
        type: 'GOOGLE_SHEETS' as any,
        secret: { tokens },
      });
    }
  }

  async getAccessToken(orgId: string, credentialId: string): Promise<string> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    
    if (cred.tokens) {
      const oAuth2Client = new OAuth2Client(
        env.GOOGLE_SHEETS_CLIENT_ID,
        env.GOOGLE_SHEETS_CLIENT_SECRET,
      );
      oAuth2Client.setCredentials(cred.tokens);
      const { token } = await oAuth2Client.getAccessToken();
      if (!token) throw new AppError('Failed to get access token', 502);
      return token;
    }

    // For service account credentials, get token via JWT
    const { JWT: JWTAuth } = await import('google-auth-library');
    let privateKey = cred.privateKey;
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    const jwt = new JWTAuth({
      email: cred.clientEmail,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });
    const { token } = await jwt.getAccessToken();
    if (!token) throw new AppError('Failed to get access token', 502);
    return token;
  }

  async executeNode(input: ExecuteGoogleSheetsNodePayload): Promise<ExecuteGoogleSheetsNodeResult> {
    const cred = await this.fetchCredentialMaterial(input.orgId, input.credentialId);
    
    let resultData: Record<string, unknown> = {};

    if (input.action === 'insert_row') {
      if (!input.values) throw new AppError('Values are required for insert_row action', 400);
      const res = await this.plugin.insertRow({
        credential: cred,
        spreadsheetId: input.spreadsheetId,
        sheetId: input.sheetId,
        values: input.values,
        timeoutMs: input.timeoutMs,
      });
      resultData = { success: res.success, rowId: res.rowId };
    } else if (input.action === 'update_row') {
      if (!input.rowId) throw new AppError('RowId is required for update_row action', 400);
      if (!input.values) throw new AppError('Values are required for update_row action', 400);
      const res = await this.plugin.updateRow({
        credential: cred,
        spreadsheetId: input.spreadsheetId,
        sheetId: input.sheetId,
        rowId: input.rowId,
        values: input.values,
        timeoutMs: input.timeoutMs,
      });
      resultData = { success: res.success };
    } else if (input.action === 'get_row') {
      const res = await this.plugin.getRow({
        credential: cred,
        spreadsheetId: input.spreadsheetId,
        sheetId: input.sheetId,
        rowId: input.rowId,
        filter: input.filter,
        timeoutMs: input.timeoutMs,
      });
      resultData = { success: res.success, rows: res.rows };
    } else {
      throw new AppError(`Unknown Google Sheets action: ${input.action}`, 400);
    }

    const mutations: ExecuteGoogleSheetsMappedMutation[] = [];
    if (input.responseMapping && input.responseMapping.length > 0) {
      for (const map of input.responseMapping) {
        const value = extractJsonPath(resultData, map.jsonPath);
        if (value !== undefined) {
          mutations.push({
            scope: map.scope,
            key: map.variableName,
            value,
          });
        }
      }
    }

    return {
      success: true,
      mappedMutations: mutations,
    };
  }
}

function extractJsonPath(input: unknown, jsonPath: string): unknown {
  if (!jsonPath.startsWith('$')) {
    return undefined;
  }

  const path = jsonPath.slice(1);
  if (!path) {
    return input;
  }

  const tokens = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let current: unknown = input;
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current) && /^\d+$/.test(token)) {
      current = current[Number(token)];
      continue;
    }

    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[token];
      continue;
    }

    return undefined;
  }

  return current;
}
