import { AppError } from '../../utils/errors';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IGoogleSheetsPlugin } from './google-sheets.interface';
import {
  GoogleSheetsCredentialMaterial,
  GoogleSheetsTestResult,
  GoogleSpreadsheetInfo,
  GoogleSheetInfo,
  GoogleSheetsInsertRowInput,
  GoogleSheetsUpdateRowInput,
  GoogleSheetsGetRowInput,
  GoogleSheetsInsertResult,
  GoogleSheetsUpdateResult,
  GoogleSheetsGetResult,
} from './google-sheets.types';
import { JWT, OAuth2Client } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

export class GoogleSheetsProviderError extends AppError {
  constructor(message: string, statusCode: number = 502) {
    super(message, statusCode);
  }
}

export class GoogleSheetsPlugin implements IPlugin, IGoogleSheetsPlugin {
  readonly name = 'google-sheets';

  private getAuthClient(credential: GoogleSheetsCredentialMaterial): JWT | OAuth2Client {
    if (credential.tokens) {
      const client = new OAuth2Client();
      client.setCredentials(credential.tokens);
      return client;
    }

    let privateKey = credential.privateKey;
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    return new JWT({
      email: credential.clientEmail,
      key: privateKey,
      scopes: SCOPES,
    });
  }

  async initialize(_registry: IPluginRegistry): Promise<void> {
    //
  }

  async shutdown(): Promise<void> {
    // Stateless
  }

  async testConnection(input: { credential: GoogleSheetsCredentialMaterial; timeoutMs?: number }): Promise<GoogleSheetsTestResult> {
    const startedAt = Date.now();
    try {
      const auth = this.getAuthClient(input.credential);
      const token = await auth.getAccessToken();

      if (!token.token) {
        throw new Error('Failed to retrieve access token');
      }

      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        statusCode: err.status || 502,
        errorCode: 'auth_error',
        errorMessage: err.message || 'Authentication failed',
      };
    }
  }

  async listSpreadsheets(input: { credential: GoogleSheetsCredentialMaterial; timeoutMs?: number }): Promise<GoogleSpreadsheetInfo[]> {
    try {
      const auth = this.getAuthClient(input.credential);
      const token = await auth.getAccessToken();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), input.timeoutMs || 10000);

      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)",
        {
          headers: {
            Authorization: `Bearer ${token.token}`,
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timer);

      if (!response.ok) {
        throw new GoogleSheetsProviderError(`Failed to fetch spreadsheets: ${response.statusText}`, response.status);
      }

      const data = await response.json() as any;
      const files = data.files || [];
      return files.map((file: any) => ({
        id: file.id,
        name: file.name,
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new GoogleSheetsProviderError('Request to list spreadsheets timed out', 504);
      }
      throw new GoogleSheetsProviderError(err.message || 'Failed to list spreadsheets');
    }
  }

  async listSheets(input: { credential: GoogleSheetsCredentialMaterial; spreadsheetId: string; timeoutMs?: number }): Promise<GoogleSheetInfo[]> {
    try {
      const auth = this.getAuthClient(input.credential);
      const doc = new GoogleSpreadsheet(input.spreadsheetId, auth);
      await doc.loadInfo();

      const sheets: GoogleSheetInfo[] = [];
      for (let i = 0; i < doc.sheetCount; i++) {
        const sheet = doc.sheetsByIndex[i];
        if (!sheet) continue;
        sheets.push({
          id: sheet.sheetId.toString(),
          name: sheet.title,
          index: sheet.index,
        });
      }

      return sheets;
    } catch (err: any) {
      throw new GoogleSheetsProviderError(err.message || 'Failed to list sheets');
    }
  }

  async insertRow(input: GoogleSheetsInsertRowInput): Promise<GoogleSheetsInsertResult> {
    try {
      const auth = this.getAuthClient(input.credential);
      const doc = new GoogleSpreadsheet(input.spreadsheetId, auth);
      await doc.loadInfo();

      const sheet = doc.sheetsById[Number(input.sheetId)];
      if (!sheet) {
        throw new GoogleSheetsProviderError('Sheet not found');
      }

      await sheet.addRow(input.values as any);

      return {
        success: true,
      };
    } catch (err: any) {
      throw new GoogleSheetsProviderError(err.message || 'Failed to insert row');
    }
  }

  async updateRow(input: GoogleSheetsUpdateRowInput): Promise<GoogleSheetsUpdateResult> {
    try {
      const auth = this.getAuthClient(input.credential);
      const doc = new GoogleSpreadsheet(input.spreadsheetId, auth);
      await doc.loadInfo();

      const sheet = doc.sheetsById[Number(input.sheetId)];
      if (!sheet) {
        throw new GoogleSheetsProviderError('Sheet not found');
      }

      const rows = await sheet.getRows();
      if (input.rowId < 1 || input.rowId > rows.length) {
         throw new GoogleSheetsProviderError('Row index out of bounds');
      }
      const rowToEdit = rows[input.rowId - 1]; // rowId is 1-indexed
      if (!rowToEdit) {
         throw new GoogleSheetsProviderError('Row index out of bounds or not found');
      }

      for (const [key, value] of Object.entries(input.values)) {
        rowToEdit.set(key, value);
      }
      await rowToEdit.save();

      return {
        success: true,
      };
    } catch (err: any) {
      throw new GoogleSheetsProviderError(err.message || 'Failed to update row');
    }
  }

  async getRow(input: GoogleSheetsGetRowInput): Promise<GoogleSheetsGetResult> {
    try {
      const auth = this.getAuthClient(input.credential);
      const doc = new GoogleSpreadsheet(input.spreadsheetId, auth);
      await doc.loadInfo();

      const sheet = doc.sheetsById[Number(input.sheetId)];
      if (!sheet) {
        throw new GoogleSheetsProviderError('Sheet not found');
      }

      const rows = await sheet.getRows();
      let matchedRows = rows;

      if (input.rowId !== undefined) {
         if (input.rowId < 1 || input.rowId > rows.length) {
            return { success: true, rows: [] };
         }
         const r = rows[input.rowId - 1];
         matchedRows = r ? [r] : [];
      } else if (input.filter) {
        matchedRows = rows.filter(row => {
          for (const [key, val] of Object.entries(input.filter!)) {
            if (row.get(key) !== val) return false;
          }
          return true;
        });
      }

      return {
        success: true,
        rows: matchedRows.map((r, index) => ({
          id: String((input.rowId || index + 1)), // Row numbers usually start from 1, though with filters it's a bit ambiguous, just returning string.
          values: r.toObject(),
        })),
      };
    } catch (err: any) {
      throw new GoogleSheetsProviderError(err.message || 'Failed to get row');
    }
  }

  async getColumns(input: { credential: GoogleSheetsCredentialMaterial; spreadsheetId: string; sheetId: string; timeoutMs?: number }): Promise<string[]> {
    try {
      const auth = this.getAuthClient(input.credential);
      const doc = new GoogleSpreadsheet(input.spreadsheetId, auth);
      await doc.loadInfo();

      const sheet = doc.sheetsById[Number(input.sheetId)];
      if (!sheet) {
        throw new GoogleSheetsProviderError('Sheet not found');
      }

      await sheet.loadHeaderRow();
      return sheet.headerValues;
    } catch (err: any) {
      throw new GoogleSheetsProviderError(err.message || 'Failed to get columns');
    }
  }
}
