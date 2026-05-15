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

  async discoverTables(): Promise<{ name: string; type: 'BASE TABLE' | 'VIEW' }[]> {
    if (!this.client) throw new Error('PostgresConnector: not connected');
    const sql = `
      SELECT table_name as name, table_type as type 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    const result = await this.client.query(sql);
    return result.rows;
  }

  async discoverColumns(tableName: string): Promise<string[]> {
    if (!this.client) throw new Error('PostgresConnector: not connected');
    const sql = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position;
    `;
    const result = await this.client.query(sql, [tableName]);
    return result.rows.map(r => r.column_name);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
