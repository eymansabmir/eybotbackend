export interface NocoDBCredentialMaterial {
  baseUrl: string;
  apiKey: string;
}

export interface NocoDBTestResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface NocoDBInsertRowInput {
  credential: NocoDBCredentialMaterial;
  tableId: string;
  fields: Array<{ key: string; value: string }>;
}

export interface NocoDBInsertResult {
  success: boolean;
  recordId?: string | number;
}

export interface NocoDBUpdateRowInput {
  credential: NocoDBCredentialMaterial;
  tableId: string;
  rowId?: string | number;
  filter?: string;
  filterConditions?: Array<{ field: string; operator: string; value: string }>;
  viewId?: string;
  fields: Array<{ key: string; value: string }>;
}

export interface NocoDBUpdateResult {
  success: boolean;
}

export interface NocoDBSearchRecordsInput {
  credential: NocoDBCredentialMaterial;
  tableId: string;
  viewId?: string;
  filter?: string;
  filterConditions?: Array<{ field: string; operator: string; value: string }>;
  returnType?: 'All' | 'First' | 'Last' | 'Random';
  fields: Array<{ key: string; value: string }>;
}

export interface NocoDBSearchResult {
  success: boolean;
  rows: Array<{
    id: string | number;
    values: Record<string, any>;
  }>;
}
