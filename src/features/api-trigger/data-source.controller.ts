import { Request, Response } from 'express';
import { PrismaClient, DbProvider } from '@prisma/client';
import { z } from 'zod';

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
  constructor(private readonly prisma: PrismaClient) {}

  create = async (req: Request, res: Response) => {
    const orgId = (req as any).auth?.session?.user?.orgId || '68b08633907a113536238290';
    const validation = dataSourceSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.format() });
    }

    const dataSource = await this.prisma.dataSource.create({
      data: {
        ...validation.data,
        orgId,
      }
    });

    res.status(201).json(dataSource);
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
