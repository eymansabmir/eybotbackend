import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ICredentialService } from '../credentials/credentials.service';
import { DbConnectorFactory } from '../../plugins/db-connectors/connector.factory';

export class DataSourceController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly credentialService: ICredentialService
  ) {}

  discover = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const ds = await this.prisma.dataSource.findUnique({ where: { id: id as string } });
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
      return res.json(tables);
    } finally {
      await connector.close();
    }
  }

  discoverColumns = async (req: Request, res: Response): Promise<any> => {
    const { id, tableName } = req.params;
    const ds = await this.prisma.dataSource.findUnique({ where: { id: id as string } });
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
      const columns = await connector.discoverColumns(tableName as string);
      return res.json(columns);
    } finally {
      await connector.close();
    }
  }

  create = async (req: Request, res: Response): Promise<any> => {
    const orgId = (req as any).auth?.session?.user?.orgId || '68b08633907a113536238290';
    const body = req.body;

    try {
      // 1. Create the secure credential first
      const credential = await this.credentialService.createCredential({
        orgId,
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

      return res.status(201).json(dataSource);
    } catch (error: any) {
      console.error('Error creating data source:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  list = async (req: Request, res: Response): Promise<any> => {
    const orgId = (req as any).auth?.session?.user?.orgId || '68b08633907a113536238290';
    const dataSources = await this.prisma.dataSource.findMany({
      where: { orgId },
      include: { credential: { select: { name: true } } }
    });
    return res.json(dataSources);
  }

  delete = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    await this.prisma.dataSource.delete({ where: { id: id as string } });
    return res.status(204).send();
  }
}
