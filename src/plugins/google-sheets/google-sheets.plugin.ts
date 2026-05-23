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
import { env } from '../../config/env';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];
const DEFAULT_TIMEOUT_MS = 20_000;
const ROW_BATCH_SIZE = 500;

export class GoogleSheetsProviderError extends AppError {
  constructor(message: string, statusCode: number = 502) {
    super(message, statusCode);
  }
}

export class GoogleSheetsPlugin implements IPlugin, IGoogleSheetsPlugin {
  readonly name = 'google-sheets';

  private getAuthClient(credential: GoogleSheetsCredentialMaterial): JWT | OAuth2Client {
    if (credential.tokens) {
      const client = new OAuth2Client(
        env.GOOGLE_SHEETS_CLIENT_ID,
        env.GOOGLE_SHEETS_CLIENT_SECRET,
        env.BETTER_AUTH_URL
          ? `${env.BETTER_AUTH_URL}/api/integrations/google-sheets/auth/callback`
          : undefined,
      );
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
      await this.withTimeout(doc.loadInfo(), input.timeoutMs, 'Loading spreadsheet info timed out');

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
      await this.withTimeout(doc.loadInfo(), input.timeoutMs, 'Loading spreadsheet info timed out');

      const sheet = doc.sheetsById[Number(input.sheetId)];
      if (!sheet) {
        throw new GoogleSheetsProviderError('Sheet not found');
      }

      await this.withTimeout(sheet.addRow(input.values as any), input.timeoutMs, 'Insert row request timed out');

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
      await this.withTimeout(doc.loadInfo(), input.timeoutMs, 'Loading spreadsheet info timed out');

      const sheet = doc.sheetsById[Number(input.sheetId)];
      if (!sheet) {
        throw new GoogleSheetsProviderError('Sheet not found');
      }

      const rowOffset = input.rowId - 1;
      const rows = await this.withTimeout(
        sheet.getRows({ offset: rowOffset, limit: 1 }),
        input.timeoutMs,
        'Update row request timed out',
      );
      const rowToEdit = rows[0]; // rowId is 1-indexed
      if (!rowToEdit) {
         throw new GoogleSheetsProviderError('Row index out of bounds or not found');
      }

      for (const [key, value] of Object.entries(input.values)) {
        rowToEdit.set(key, value);
      }
      await this.withTimeout(rowToEdit.save(), input.timeoutMs, 'Saving updated row timed out');

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
      await this.withTimeout(doc.loadInfo(), input.timeoutMs, 'Loading spreadsheet info timed out');

      const sheet = doc.sheetsById[Number(input.sheetId)];
      if (!sheet) {
        throw new GoogleSheetsProviderError('Sheet not found');
      }

      if (input.rowId !== undefined) {
        const rows = await this.withTimeout(
          sheet.getRows({ offset: input.rowId - 1, limit: 1 }),
          input.timeoutMs,
          'Get row request timed out',
        );
        const row = rows[0];
        if (!row) return { success: true, rows: [] };

        return {
          success: true,
          rows: [{
            id: String(input.rowId),
            values: row.toObject(),
          }],
        };
      }

      const matchedRows: Array<{ id: string; values: Record<string, unknown> }> = [];
      let offset = 0;

      while (true) {
        const batch = await this.withTimeout(
          sheet.getRows({ offset, limit: ROW_BATCH_SIZE }),
          input.timeoutMs,
          'Scanning rows timed out',
        );

        if (batch.length === 0) break;

        for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
          const row = batch[batchIndex];
          if (!row) continue;

          if (input.filter) {
            let isMatch = true;
            if (input.filter.comparisons && Array.isArray(input.filter.comparisons)) {
              for (const comp of input.filter.comparisons) {
                if (!comp || !comp.column) continue;
                const cellValue = String(row.get(comp.column) ?? "");
                const targetValue = String(comp.value ?? "");
                const op = comp.comparisonOperator;

                if (op === "Equal to") {
                  if (cellValue !== targetValue) { isMatch = false; break; }
                } else if (op === "Not equal") {
                  if (cellValue === targetValue) { isMatch = false; break; }
                } else if (op === "Contains") {
                  if (!cellValue.includes(targetValue)) { isMatch = false; break; }
                } else if (op === "Does not contain") {
                  if (cellValue.includes(targetValue)) { isMatch = false; break; }
                } else if (op === "Greater than") {
                  if (!(Number(cellValue) > Number(targetValue))) { isMatch = false; break; }
                } else if (op === "Greater or equal to") {
                  if (!(Number(cellValue) >= Number(targetValue))) { isMatch = false; break; }
                } else if (op === "Less than") {
                  if (!(Number(cellValue) < Number(targetValue))) { isMatch = false; break; }
                } else if (op === "Less or equal to") {
                  if (!(Number(cellValue) <= Number(targetValue))) { isMatch = false; break; }
                } else if (op === "Is set") {
                  if (!cellValue) { isMatch = false; break; }
                } else if (op === "Is empty") {
                  if (cellValue) { isMatch = false; break; }
                }
              }
            } else {
              for (const [key, val] of Object.entries(input.filter)) {
                if (row.get(key) !== val) {
                  isMatch = false;
                  break;
                }
              }
            }
            if (!isMatch) continue;
          }

          matchedRows.push({
            id: this.rowOutputId(row, offset + batchIndex + 1),
            values: row.toObject(),
          });
        }

        offset += batch.length;
        if (batch.length < ROW_BATCH_SIZE) break;
      }

      let finalRows = matchedRows;
      if (input.filter && (input.filter as any).totalRowsToExtract) {
        const mode = String((input.filter as any).totalRowsToExtract).toLowerCase();
        if (mode === "first" && matchedRows.length > 0) {
          finalRows = [matchedRows[0]!];
        } else if (mode === "last" && matchedRows.length > 0) {
          finalRows = [matchedRows[matchedRows.length - 1]!];
        } else if (mode === "random" && matchedRows.length > 0) {
          const randomIndex = Math.floor(Math.random() * matchedRows.length);
          finalRows = [matchedRows[randomIndex]!];
        } else if (mode === "all" && (input.filter as any).limit) {
          const limit = Number((input.filter as any).limit);
          if (limit > 0) {
            finalRows = matchedRows.slice(0, limit);
          }
        }
      }

      return {
        success: true,
        rows: finalRows,
      };
    } catch (err: any) {
      throw new GoogleSheetsProviderError(err.message || 'Failed to get row');
    }
  }

  async getColumns(input: { credential: GoogleSheetsCredentialMaterial; spreadsheetId: string; sheetId: string; timeoutMs?: number }): Promise<string[]> {
    try {
      const auth = this.getAuthClient(input.credential);
      const doc = new GoogleSpreadsheet(input.spreadsheetId, auth);
      await this.withTimeout(doc.loadInfo(), input.timeoutMs, 'Loading spreadsheet info timed out');

      const sheet = doc.sheetsById[Number(input.sheetId)];
      if (!sheet) {
        throw new GoogleSheetsProviderError('Sheet not found');
      }

      await this.withTimeout(sheet.loadHeaderRow(), input.timeoutMs, 'Loading sheet headers timed out');
      return sheet.headerValues;
    } catch (err: any) {
      throw new GoogleSheetsProviderError(err.message || 'Failed to get columns');
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs?: number, timeoutMessage = 'Google Sheets request timed out'): Promise<T> {
    const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new GoogleSheetsProviderError(timeoutMessage, 504));
          }, effectiveTimeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private rowOutputId(row: unknown, fallbackIndex: number): string {
    if (row && typeof row === 'object') {
      const maybeRowNumber = (row as { rowNumber?: unknown }).rowNumber;
      if (typeof maybeRowNumber === 'number' && Number.isInteger(maybeRowNumber)) {
        return String(maybeRowNumber);
      }
    }

    return String(fallbackIndex);
  }
}
