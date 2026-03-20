export interface GoogleSheetsCredentialMaterial {
  clientEmail?: string;
  privateKey?: string;
  tokens?: any; // Google API Credentials object
}

export type GoogleSheetsActionMode = 'insert_row' | 'update_row' | 'get_row';

export interface GoogleSheetsTestResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface GoogleSpreadsheetInfo {
  id: string;
  name: string;
}

export interface GoogleSheetInfo {
  id: string;
  name: string;
  index: number;
}

export interface GoogleSheetsInsertRowInput {
  credential: GoogleSheetsCredentialMaterial;
  spreadsheetId: string;
  sheetId: string;
  values: Record<string, unknown>;
  timeoutMs?: number;
}

export interface GoogleSheetsUpdateRowInput {
  credential: GoogleSheetsCredentialMaterial;
  spreadsheetId: string;
  sheetId: string;
  rowId: number;
  values: Record<string, unknown>;
  timeoutMs?: number;
}

export interface GoogleSheetsGetRowInput {
  credential: GoogleSheetsCredentialMaterial;
  spreadsheetId: string;
  sheetId: string;
  rowId?: number; // optionally get specific row by index
  filter?: Record<string, unknown>; // simple filter support
  timeoutMs?: number;
}

export interface GoogleSheetsRowOutput {
  id: string; // The row number or reference ID
  values: Record<string, unknown>;
}

export interface GoogleSheetsInsertResult {
  success: boolean;
  rowId?: string;
}

export interface GoogleSheetsUpdateResult {
  success: boolean;
  rowId?: string;
}

export interface GoogleSheetsGetResult {
  success: boolean;
  rows: GoogleSheetsRowOutput[];
}

export interface GoogleSheetsResponseMapping {
  jsonPath: string;
  variableName: string;
  scope: 'session' | 'contact';
}

export interface ExecuteGoogleSheetsNodePayload {
  orgId: string;
  credentialId: string;
  action: 'insert_row' | 'update_row' | 'get_row';
  spreadsheetId: string;
  sheetId: string;
  rowId?: number;
  values?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  timeoutMs?: number;
  responseMapping?: GoogleSheetsResponseMapping[];
}

export interface ExecuteGoogleSheetsMappedMutation {
  scope: 'session' | 'contact';
  key: string;
  value: unknown;
}

export interface ExecuteGoogleSheetsNodeResult {
  success: boolean;
  mappedMutations: ExecuteGoogleSheetsMappedMutation[];
}
