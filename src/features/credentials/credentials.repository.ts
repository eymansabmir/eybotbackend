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

  private normalizeBusinessNumber(input: string): string {
    return input.replace(/\D/g, '');
  }

  private matchesBusinessNumber(
    credential: Credential,
    waBusinessNumber: string,
    normalizedBusinessNumber: string,
  ): boolean {
    const metadata = credential.metadata as Record<string, unknown> | null;
    if (!metadata) return false;

    const phoneNumberId = typeof metadata.phoneNumberId === 'string' ? metadata.phoneNumberId : '';
    const displayPhoneNumber = typeof metadata.displayPhoneNumber === 'string' ? metadata.displayPhoneNumber : '';

    if (phoneNumberId && phoneNumberId === waBusinessNumber) return true;
    if (displayPhoneNumber && this.normalizeBusinessNumber(displayPhoneNumber) === normalizedBusinessNumber) return true;
    return false;
  }

  private async findActiveWhatsAppByPhoneNumberId(
    waBusinessNumber: string,
    orgId?: string,
  ): Promise<Credential | null> {
    return this.prisma.credential.findFirst({
      where: {
        ...(orgId ? { orgId } : {}),
        type: 'WHATSAPP_CLOUD',
        isActive: true,
        revokedAt: null,
        metadata: {
          path: ['phoneNumberId'],
          equals: waBusinessNumber,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

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

  async findActiveWhatsAppByBusinessNumber(waBusinessNumber: string): Promise<Credential | null> {
    const directMatch = await this.findActiveWhatsAppByPhoneNumberId(waBusinessNumber);
    if (directMatch) {
      return directMatch;
    }

    const normalized = this.normalizeBusinessNumber(waBusinessNumber);

    const candidates = await this.prisma.credential.findMany({
      where: {
        type: 'WHATSAPP_CLOUD',
        isActive: true,
        revokedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return candidates.find((credential) => this.matchesBusinessNumber(credential, waBusinessNumber, normalized)) ?? null;
  }

  async findActiveWhatsAppByBusinessNumberForOrg(orgId: string, waBusinessNumber: string): Promise<Credential | null> {
    const directMatch = await this.findActiveWhatsAppByPhoneNumberId(waBusinessNumber, orgId);
    if (directMatch) {
      return directMatch;
    }

    const normalized = this.normalizeBusinessNumber(waBusinessNumber);

    const candidates = await this.prisma.credential.findMany({
      where: {
        orgId,
        type: 'WHATSAPP_CLOUD',
        isActive: true,
        revokedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return candidates.find((credential) => this.matchesBusinessNumber(credential, waBusinessNumber, normalized)) ?? null;
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

  async hardDelete(orgId: string, id: string): Promise<void> {
    const result = await this.prisma.credential.deleteMany({
      where: {
        id,
        ...this.baseWhere(orgId),
      },
    });

    if (result.count === 0) {
      throw new NotFoundError('Credential', id);
    }
  }
}
