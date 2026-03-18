import { Prisma, type Credential, type CredentialType, type PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../utils/errors';
import type {
  CreateEncryptedCredentialInput,
  CredentialQueryOptions,
  ICredentialRepository,
  UpdateEncryptedCredentialInput,
} from './credentials.repository.interface';

export class PrismaCredentialRepository implements ICredentialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private toPrismaBytes(value: Buffer): Uint8Array<ArrayBuffer> {
    return new Uint8Array(value);
  }

  private toPrismaUpdateData(
    updates: UpdateEncryptedCredentialInput,
  ): Prisma.CredentialUpdateManyMutationInput {
    const { metadata, ...rest } = updates;

    return {
      ...rest,
      ...(metadata !== undefined && {
        metadata: metadata === null ? Prisma.JsonNull : metadata,
      }),
    };
  }

  private baseWhere(orgId: string, type?: CredentialType): Prisma.CredentialWhereInput {
    return {
      orgId,
      ...(type ? { type } : {}),
    };
  }

  async create(input: CreateEncryptedCredentialInput): Promise<Credential> {
    return this.prisma.credential.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        type: input.type,
        ciphertext: this.toPrismaBytes(input.ciphertext),
        iv: this.toPrismaBytes(input.iv),
        authTag: this.toPrismaBytes(input.authTag),
        keyVersion: input.keyVersion,
        metadata: input.metadata,
        isActive: input.isActive ?? true,
      },
    });
  }

  async findById(orgId: string, id: string): Promise<Credential | null> {
    logger.info(
      {
        orgId,
        credentialId: id,
        action: 'credential.findById',
      },
      'STEP 4: DB query',
    );
    return this.prisma.credential.findFirst({
      where: {
        id,
        ...this.baseWhere(orgId),
      },
    });
  }

  async findByIdOrFail(orgId: string, id: string): Promise<Credential> {
    const credential = await this.findById(orgId, id);
    if (!credential) {
      throw new NotFoundError('Credential', id);
    }
    return credential;
  }

  async findByName(orgId: string, type: CredentialType, name: string): Promise<Credential | null> {
    return this.prisma.credential.findFirst({
      where: {
        name,
        ...this.baseWhere(orgId, type),
      },
    });
  }

  async listByOrgId(orgId: string, options: CredentialQueryOptions = {}): Promise<Credential[]> {
    const where: Prisma.CredentialWhereInput = this.baseWhere(orgId, options.type);

    if (!options.includeInactive) {
      where.isActive = true;
    }

    if (!options.includeRevoked) {
      where.revokedAt = null;
    }

    return this.prisma.credential.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async update(
    orgId: string,
    id: string,
    updates: UpdateEncryptedCredentialInput,
  ): Promise<Credential> {
    const result = await this.prisma.credential.updateMany({
      where: {
        id,
        ...this.baseWhere(orgId),
      },
      data: this.toPrismaUpdateData(updates),
    });

    if (result.count === 0) {
      throw new NotFoundError('Credential', id);
    }

    return this.findByIdOrFail(orgId, id);
  }
}
