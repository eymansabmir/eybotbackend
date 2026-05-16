import { PrismaClient, ApiKey } from '@prisma/client';

export interface IApiKeyRepository {
  findAllByOrgId(orgId: string): Promise<ApiKey[]>;
  findByAppId(appId: string): Promise<ApiKey | null>;
  create(data: { orgId: string, name: string, appId: string, appSecretHash: string }): Promise<ApiKey>;
  delete(id: string, orgId: string): Promise<void>;
}

export class PrismaApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllByOrgId(orgId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByAppId(appId: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findUnique({
      where: { appId, isActive: true },
    });
  }

  async create(data: { orgId: string, name: string, appId: string, appSecretHash: string }): Promise<ApiKey> {
    return this.prisma.apiKey.create({
      data: {
        ...data,
        isActive: true,
      },
    });
  }

  async delete(id: string, orgId: string): Promise<void> {
    await this.prisma.apiKey.deleteMany({
      where: { id, orgId },
    });
  }
}
