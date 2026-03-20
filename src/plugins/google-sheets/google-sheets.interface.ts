import type {
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

export interface IGoogleSheetsPlugin {
  testConnection(input: { credential: GoogleSheetsCredentialMaterial; timeoutMs?: number }): Promise<GoogleSheetsTestResult>;
  listSpreadsheets(input: { credential: GoogleSheetsCredentialMaterial; timeoutMs?: number }): Promise<GoogleSpreadsheetInfo[]>;
  listSheets(input: { credential: GoogleSheetsCredentialMaterial; spreadsheetId: string; timeoutMs?: number }): Promise<GoogleSheetInfo[]>;
  insertRow(input: GoogleSheetsInsertRowInput): Promise<GoogleSheetsInsertResult>;
  updateRow(input: GoogleSheetsUpdateRowInput): Promise<GoogleSheetsUpdateResult>;
  getRow(input: GoogleSheetsGetRowInput): Promise<GoogleSheetsGetResult>;
  getColumns(input: { credential: GoogleSheetsCredentialMaterial; spreadsheetId: string; sheetId: string; timeoutMs?: number }): Promise<string[]>;
}

export interface IGoogleSheetsIntegrationService {
  testCredential(orgId: string, credentialId: string): Promise<GoogleSheetsTestResult>;
  listSpreadsheets(orgId: string, credentialId: string): Promise<GoogleSpreadsheetInfo[]>;
  listSheets(orgId: string, credentialId: string, spreadsheetId: string): Promise<GoogleSheetInfo[]>;
  insertRow(orgId: string, credentialId: string, payload: Omit<GoogleSheetsInsertRowInput, 'credential'>): Promise<GoogleSheetsInsertResult>;
  updateRow(orgId: string, credentialId: string, payload: Omit<GoogleSheetsUpdateRowInput, 'credential'>): Promise<GoogleSheetsUpdateResult>;
  getRow(orgId: string, credentialId: string, payload: Omit<GoogleSheetsGetRowInput, 'credential'>): Promise<GoogleSheetsGetResult>;
  getColumns(orgId: string, credentialId: string, spreadsheetId: string, sheetId: string): Promise<string[]>;
  getAuthUrl(orgId: string): string;
  handleAuthCallback(orgId: string, code: string): Promise<void>;
  getAccessToken(orgId: string, credentialId: string): Promise<string>;
}
