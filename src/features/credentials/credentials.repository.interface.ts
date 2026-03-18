import type { Credential, CredentialType, Prisma } from '@prisma/client';

export interface CreateEncryptedCredentialInput {
  orgId: string;
  name: string;
  type: CredentialType;
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
  metadata?: Prisma.InputJsonValue;
  isActive?: boolean;
}

export interface UpdateEncryptedCredentialInput {
  name?: string;
  metadata?: Prisma.InputJsonValue | null;
  isActive?: boolean;
  lastTestedAt?: Date | null;
  revokedAt?: Date | null;
}

export interface CredentialQueryOptions {
  type?: CredentialType;
  includeInactive?: boolean;
  includeRevoked?: boolean;
}

export interface ICredentialRepository {
  create(input: CreateEncryptedCredentialInput): Promise<Credential>;
  findById(orgId: string, id: string): Promise<Credential | null>;
  findByIdOrFail(orgId: string, id: string): Promise<Credential>;
  findByName(orgId: string, type: CredentialType, name: string): Promise<Credential | null>;
  listByOrgId(orgId: string, options?: CredentialQueryOptions): Promise<Credential[]>;
  update(orgId: string, id: string, updates: UpdateEncryptedCredentialInput): Promise<Credential>;
}
