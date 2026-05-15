import { DbProvider } from '@prisma/client';
import { IDbConnector } from './db-connector.interface';
import { PostgresConnector } from './postgres.connector';

export class DbConnectorFactory {
  static getConnector(provider: DbProvider): IDbConnector {
    switch (provider) {
      case DbProvider.POSTGRES:
        return new PostgresConnector();
      // case DbProvider.MYSQL:
      //   return new MySqlConnector(); // To be implemented
      default:
        throw new Error(`DbConnectorFactory: provider ${provider} not supported yet`);
    }
  }
}
