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

export const NOCODB_PLUGIN = 'nocodb';

export interface INocoDBPlugin {
  readonly name: string;
  testConnection(input: { credential: NocoDBCredentialMaterial; timeoutMs?: number }): Promise<NocoDBTestResult>;
  createRecord(input: NocoDBInsertRowInput): Promise<NocoDBInsertResult>;
  updateRecord(input: NocoDBUpdateRowInput): Promise<NocoDBUpdateResult>;
  searchRecords(input: NocoDBSearchRecordsInput): Promise<NocoDBSearchResult>;
}
