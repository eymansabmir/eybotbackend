import type { CredentialType, Prisma } from '@prisma/client';

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export interface CredentialView {
  id: string;
  orgId: string;
  name: string;
  type: CredentialType;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  lastTestedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialPayload {
  orgId: string;
  name: string;
  type: CredentialType;
  secret: Record<string, unknown>;
  metadata?: Prisma.InputJsonValue;
  isActive?: boolean;
}

export interface UpdateCredentialPayload {
  name?: string;
  metadata?: Prisma.InputJsonValue | null;
  isActive?: boolean;
}

export interface ListCredentialsOptions {
  type?: CredentialType;
  includeInactive?: boolean;
  includeRevoked?: boolean;
}
