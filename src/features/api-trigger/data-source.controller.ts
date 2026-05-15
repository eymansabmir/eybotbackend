import { Request, Response } from 'express';
import { PrismaClient, DbProvider } from '@prisma/client';
import { z } from 'zod';
import { ICredentialService } from '../credentials/credentials.service';
import { DbConnectorFactory } from '../../plugins/db-connectors/connector.factory';
import { DbConnectionConfig } from '../../plugins/db-connectors/db-connector.interface';

const dataSourceSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(DbProvider),
  credentialId: z.string().uuid(),
  config: z.object({
    host: z.string(),
    port: z.number(),
    database: z.string(),
    ssl: z.boolean().optional().default(false),
  })
});

export class DataSourceController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly credentialService: ICredentialService
  ) {}

  discover = async (req: Request, res: Response) => {
    const { id } = req.params;
    const ds = await this.prisma.dataSource.findUnique({ where: { id } });
    if (!ds) return res.status(404).json({ error: 'Data source not found' });

    const secret = await this.credentialService.decryptSecret(ds.orgId, ds.credentialId, 'DATABASE_CONNECTOR');
    const connector = DbConnectorFactory.getConnector(ds.type);

    try {
      await connector.connect({
        host: (ds.config as any).host,
        port: (ds.config as any).port,
        database: (ds.config as any).database,
        user: secret.user as string,
        password: secret.password as string,
        ssl: (ds.config as any).ssl,
      });
      const tables = await connector.discoverTables();
      res.json(tables);
    } finally {
      await connector.close();
    }
  }

  discoverColumns = async (req: Request, res: Response) => {
    const { id, tableName } = req.params;
    const ds = await this.prisma.dataSource.findUnique({ where: { id } });
    if (!ds) return res.status(404).json({ error: 'Data source not found' });

    const secret = await this.credentialService.decryptSecret(ds.orgId, ds.credentialId, 'DATABASE_CONNECTOR');
    const connector = DbConnectorFactory.getConnector(ds.type);

    try {
      await connector.connect({
        host: (ds.config as any).host,
        port: (ds.config as any).port,
        database: (ds.config as any).database,
        user: secret.user as string,
        password: secret.password as string,
        ssl: (ds.config as any).ssl,
      });
      const columns = await connector.discoverColumns(tableName);
      res.json(columns);
    } finally {
      await connector.close();
    }
  }

  create = async (req: Request, res: Response) => {
    const orgId = (req as any).auth?.session?.user?.orgId || '68b08633907a113536238290';
    const body = req.body;

    try {
      // 1. Create the secure credential first
      const credential = await this.credentialService.create(orgId, {
        name: `${body.name} Credentials`,
        type: 'DATABASE_CONNECTOR',
        secret: {
          user: body.username,
          password: body.password
        }
      });

      // 2. Create the data source linked to that credential
      const dataSource = await this.prisma.dataSource.create({
        data: {
          orgId,
          name: body.name,
          type: body.provider || 'POSTGRES',
          credentialId: credential.id,
          config: {
            host: body.host,
            port: Number(body.port),
            database: body.databaseName,
            ssl: body.ssl
          }
        }
      });

      res.status(201).json(dataSource);
    } catch (error: any) {
      console.error('Error creating data source:', error);
      res.status(500).json({ error: error.message });
    }
  }

  list = async (req: Request, res: Response) => {
    const orgId = (req as any).auth?.session?.user?.orgId || '68b08633907a113536238290';
    const dataSources = await this.prisma.dataSource.findMany({
      where: { orgId },
      include: { credential: { select: { name: true } } }
    });
    res.json(dataSources);
  }

  delete = async (req: Request, res: Response) => {
    const { id } = req.params;
    await this.prisma.dataSource.delete({ where: { id } });
    res.status(204).send();
  }
}
