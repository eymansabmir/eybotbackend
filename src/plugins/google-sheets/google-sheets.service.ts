import { CredentialType } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
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

const ResponseMappingSchema = z.object({
  jsonPath: z.string().min(1),
  variableName: z.string().min(1),
  scope: z.enum(['session', 'contact']),
});

export class GoogleSheetsIntegrationService implements IGoogleSheetsIntegrationService {
  private static readonly OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly credentials: ICredentialService,
    private readonly registry: IPluginRegistry
  ) {}

  private get plugin(): IGoogleSheetsPlugin {
    return this.registry.get<IGoogleSheetsPlugin>('google-sheets');
  }

  private async fetchCredentialMaterial(orgId: string, credentialId: string): Promise<GoogleSheetsCredentialMaterial> {
    const secret = await this.credentials.decryptSecret(orgId, credentialId, CredentialType.GOOGLE_SHEETS);
    
    const tokens = secret['tokens'];
    if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
      return { tokens: tokens as Record<string, unknown> };
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

  async getAccessToken(orgId: string, credentialId: string): Promise<string> {
    const cred = await this.fetchCredentialMaterial(orgId, credentialId);
    if (!cred.tokens) {
      throw new AppError('Google Picker requires OAuth-based Google Sheets credentials', 400);
    }

    const oAuth2Client = this.createOAuthClient();
    oAuth2Client.setCredentials(cred.tokens);

    const token = await oAuth2Client.getAccessToken();
    if (!token.token) {
      throw new AppError('Unable to generate Google access token', 502);
    }

    return token.token;
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
    const oAuth2Client = this.createOAuthClient();

    return oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state: this.buildOAuthState(orgId),
    });
  }

  async handleAuthCallback(stateToken: string, code: string): Promise<void> {
    const orgId = this.parseAndValidateOAuthState(stateToken);

    const oAuth2Client = this.createOAuthClient();

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    try {
      const response = await oAuth2Client.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
      const email = (response.data as any).email || 'Google Sheets User';

      await this.createOAuthCredential(orgId, email, tokens);
    } catch (error) {
       console.error("Failed to fetch userinfo during Google Sheets auth", error);
      await this.createOAuthCredential(orgId, 'Google Sheets Account', tokens);
    }
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
      if (!Number.isInteger(input.rowId) || (input.rowId as number) < 1) {
        throw new AppError('RowId must be a positive integer for update_row action', 400);
      }
      if (!input.values) throw new AppError('Values are required for update_row action', 400);
      const res = await this.plugin.updateRow({
        credential: cred,
        spreadsheetId: input.spreadsheetId,
        sheetId: input.sheetId,
        rowId: input.rowId as number,
        values: input.values,
        timeoutMs: input.timeoutMs,
      });
      resultData = { success: res.success };
    } else if (input.action === 'get_row') {
      if (input.rowId !== undefined && (!Number.isInteger(input.rowId) || input.rowId < 1)) {
        throw new AppError('RowId must be a positive integer for get_row action', 400);
      }
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
    const responseMapping = ResponseMappingSchema.array().safeParse(input.responseMapping ?? []);
    if (!responseMapping.success) {
      throw new AppError('Invalid responseMapping payload for Google Sheets node', 400);
    }

    if (responseMapping.data.length > 0) {
      for (const map of responseMapping.data) {
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

  private buildOAuthState(orgId: string): string {
    const payload = {
      orgId,
      nonce: randomBytes(12).toString('hex'),
      issuedAt: Date.now(),
    };

    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', env.BETTER_AUTH_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private parseAndValidateOAuthState(stateToken: string): string {
    const parts = stateToken.split('.');
    if (parts.length !== 2) {
      throw new AppError('Invalid OAuth state', 400);
    }

    const [encoded, signature] = parts;
    if (!encoded || !signature) {
      throw new AppError('Invalid OAuth state', 400);
    }

    const expectedSignature = createHmac('sha256', env.BETTER_AUTH_SECRET).update(encoded).digest();
    let providedSignature: Buffer;
    try {
      providedSignature = Buffer.from(signature, 'base64url');
    } catch {
      throw new AppError('Invalid OAuth state signature', 400);
    }

    if (
      expectedSignature.length !== providedSignature.length ||
      !timingSafeEqual(expectedSignature, providedSignature)
    ) {
      throw new AppError('Invalid OAuth state signature', 400);
    }

    let parsed: { orgId?: string; issuedAt?: number };
    try {
      parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw new AppError('Invalid OAuth state payload', 400);
    }

    if (!parsed.orgId || typeof parsed.orgId !== 'string') {
      throw new AppError('Invalid OAuth state orgId', 400);
    }

    if (typeof parsed.issuedAt !== 'number') {
      throw new AppError('Invalid OAuth state timestamp', 400);
    }

    if (Date.now() - parsed.issuedAt > GoogleSheetsIntegrationService.OAUTH_STATE_TTL_MS) {
      throw new AppError('OAuth state expired, please retry', 400);
    }

    return parsed.orgId;
  }

  private async createOAuthCredential(orgId: string, preferredName: string, tokens: unknown): Promise<void> {
    const trimmedBaseName = preferredName.trim() || 'Google Sheets Account';

    try {
      await this.credentials.createCredential({
        orgId,
        name: trimmedBaseName,
        type: CredentialType.GOOGLE_SHEETS,
        secret: { tokens },
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        throw error;
      }
    }

    const fallbackName = `${trimmedBaseName} ${Date.now()}`;
    await this.credentials.createCredential({
      orgId,
      name: fallbackName,
      type: CredentialType.GOOGLE_SHEETS,
      secret: { tokens },
    });
  }

  private createOAuthClient(): OAuth2Client {
    if (!env.GOOGLE_SHEETS_CLIENT_ID || !env.GOOGLE_SHEETS_CLIENT_SECRET || !env.BETTER_AUTH_URL) {
      throw new AppError('Google Sheets OAuth is not configured correctly', 500);
    }

    return new OAuth2Client(
      env.GOOGLE_SHEETS_CLIENT_ID,
      env.GOOGLE_SHEETS_CLIENT_SECRET,
      `${env.BETTER_AUTH_URL}/api/integrations/google-sheets/auth/callback`,
    );
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

  if (path.includes('[*]') || path.includes('*')) {
    const cleanPath = path.replace(/\[\*\]/g, '');
    const parts = cleanPath.split('.').filter(Boolean);
    
    let current: any = input;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (Array.isArray(current)) {
        const remainingParts = parts.slice(i);
        const results = current.map(item => {
          let sub: any = item;
          for (const subPart of remainingParts) {
            if (sub === null || sub === undefined) return undefined;
            if (typeof sub === 'object') {
              sub = sub[subPart];
            } else {
              return undefined;
            }
          }
          return sub;
        }).filter(val => val !== undefined && val !== null);
        
        return results.join('\n');
      }
      
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }
    return current;
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
