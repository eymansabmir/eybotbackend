export interface DbConnectionConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl?: boolean;
}

export interface IDbConnector {
  connect(config: DbConnectionConfig): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  close(): Promise<void>;
}
