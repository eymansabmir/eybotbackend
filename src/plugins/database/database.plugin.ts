import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IDatabasePlugin } from './database.interface';

export class DatabasePlugin implements IPlugin, IDatabasePlugin {
  readonly name = 'database';

  private _prisma!: PrismaClient;

  get prisma(): PrismaClient {
    return this._prisma;
  }

  async initialize(_registry: IPluginRegistry): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('[DatabasePlugin] DATABASE_URL environment variable is required');
    }

    const isLocalConnection = (() => {
      try {
        const host = new URL(connectionString).hostname;
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
      } catch {
        return connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
      }
    })();

    const pool = new pg.Pool({
      connectionString,
      ssl: isLocalConnection ? false : { rejectUnauthorized: false }
    });
    const adapter = new PrismaPg(pool);
    this._prisma = new PrismaClient({
      adapter,
      log: process.env.PRISMA_LOG_QUERIES === 'true'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
    });

    await this._prisma.$connect();
    logger.info('DatabasePlugin: PostgreSQL connected');
  }

  async shutdown(): Promise<void> {
    await this._prisma.$disconnect();
    logger.info('DatabasePlugin: PostgreSQL disconnected');
  }
}
