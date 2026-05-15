import { Client } from 'pg';
import { IDbConnector, DbConnectionConfig } from './db-connector.interface';

export class PostgresConnector implements IDbConnector {
  private client: Client | null = null;

  async connect(config: DbConnectionConfig): Promise<void> {
    this.client = new Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    });

    await this.client.connect();
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.client) throw new Error('PostgresConnector: not connected');
    const result = await this.client.query(sql, params);
    return result.rows;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
