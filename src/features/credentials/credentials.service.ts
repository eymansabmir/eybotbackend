import type { Credential, CredentialType } from '@prisma/client';
import { ValidationError } from '../../utils/errors';
import { CredentialSecretCrypto } from './credentials.crypto';
import type {
  CreateCredentialPayload,
  CredentialView,
  ListCredentialsOptions,
  UpdateCredentialPayload,
} from './credentials.types';
import type { ICredentialRepository } from './credentials.repository.interface';
import { ActivityLogService } from '../activity-log/application/activity-log.service';
import { ActivityAction, ActivityEntityType } from '../activity-log/domain/activity-log.types';

export interface ICredentialService {
  createCredential(input: CreateCredentialPayload): Promise<CredentialView>;
  getCredential(orgId: string, id: string): Promise<CredentialView>;
  listCredentials(orgId: string, options?: ListCredentialsOptions): Promise<CredentialView[]>;
  updateCredential(orgId: string, id: string, updates: UpdateCredentialPayload): Promise<CredentialView>;
  revokeCredential(orgId: string, id: string): Promise<CredentialView>;
  deleteCredential(orgId: string, id: string): Promise<void>;
  markTested(orgId: string, id: string): Promise<CredentialView>;
  decryptSecret(orgId: string, id: string, expectedType: CredentialType): Promise<Record<string, unknown>>;
}

export class CredentialService implements ICredentialService {
  private _crypto?: CredentialSecretCrypto;

  constructor(
    private readonly repo: ICredentialRepository,
    crypto?: CredentialSecretCrypto,
    private readonly activityLogService?: ActivityLogService,
  ) {
    this._crypto = crypto;
  }

  private get crypto(): CredentialSecretCrypto {
    if (!this._crypto) {
      this._crypto = CredentialSecretCrypto.fromEnv();
    }
    return this._crypto;
  }

  async createCredential(input: CreateCredentialPayload): Promise<CredentialView> {
    const orgId = input.orgId.trim();
    const name = input.name.trim();

    if (!orgId) throw new ValidationError('orgId is required');
    if (!name) throw new ValidationError('Credential name is required');
    if (!input.secret || Object.keys(input.secret).length === 0) {
      throw new ValidationError('Credential secret is required');
    }

    const existing = await this.repo.findByName(orgId, input.type, name);
    if (existing) {
      throw new ValidationError(`Credential '${name}' already exists for this org and type`);
    }

    if (input.type === 'WHATSAPP_CLOUD') {
      const metadata = (input.metadata ?? {}) as Record<string, unknown>;
      if (!metadata.displayPhoneNumber || typeof metadata.displayPhoneNumber !== 'string' || metadata.displayPhoneNumber.trim().length === 0) {
        throw new ValidationError('displayPhoneNumber is required for WHATSAPP_CLOUD credentials in metadata');
      }
      if (!metadata.phoneNumberId || typeof metadata.phoneNumberId !== 'string' || metadata.phoneNumberId.trim().length === 0) {
        throw new ValidationError('phoneNumberId is required for WHATSAPP_CLOUD credentials in metadata');
      }
    }

    const encrypted = this.crypto.encryptString(JSON.stringify(input.secret));

    const created = await this.repo.create({
      orgId,
      name,
      type: input.type,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      metadata: input.metadata,
      isActive: input.isActive ?? true,
    });

    if (this.activityLogService) {
      await this.activityLogService.record({
        orgId: created.orgId,
        action: ActivityAction.CREDENTIAL_CREATED,
        entityType: ActivityEntityType.CREDENTIAL,
        entityId: created.id,
        metadata: { name: created.name, type: created.type },
      });
    }

    return this.toView(created);
  }

  async getCredential(orgId: string, id: string): Promise<CredentialView> {
    const credential = await this.repo.findByIdOrFail(orgId, id);
    return this.toView(credential);
  }

  async listCredentials(
    orgId: string,
    options: ListCredentialsOptions = {},
  ): Promise<CredentialView[]> {
    const credentials = await this.repo.listByOrgId(orgId, options);
    return credentials.map((c) => this.toView(c));
  }

  async updateCredential(
    orgId: string,
    id: string,
    updates: UpdateCredentialPayload,
  ): Promise<CredentialView> {
    const updated = await this.repo.update(orgId, id, updates);

    if (this.activityLogService) {
      await this.activityLogService.record({
        orgId: updated.orgId,
        action: ActivityAction.CREDENTIAL_UPDATED,
        entityType: ActivityEntityType.CREDENTIAL,
        entityId: id,
        metadata: { name: updated.name, type: updated.type, updates: Object.keys(updates) },
      });
    }

    return this.toView(updated);
  }

  async revokeCredential(orgId: string, id: string): Promise<CredentialView> {
    const revoked = await this.repo.update(orgId, id, {
      isActive: false,
      revokedAt: new Date(),
    });

    if (this.activityLogService) {
      await this.activityLogService.record({
        orgId: revoked.orgId,
        action: ActivityAction.CREDENTIAL_UPDATED,
        entityType: ActivityEntityType.CREDENTIAL,
        entityId: id,
        metadata: { name: revoked.name, action: 'revoked' },
      });
    }

    return this.toView(revoked);
  }

  async deleteCredential(orgId: string, id: string): Promise<void> {
    const credential = await this.repo.findByIdOrFail(orgId, id);
    await this.repo.hardDelete(orgId, id);

    if (this.activityLogService) {
      await this.activityLogService.record({
        orgId,
        action: ActivityAction.CREDENTIAL_DELETED,
        entityType: ActivityEntityType.CREDENTIAL,
        entityId: id,
        metadata: { name: credential.name, type: credential.type },
      });
    }
  }

  async markTested(orgId: string, id: string): Promise<CredentialView> {
    const updated = await this.repo.update(orgId, id, { lastTestedAt: new Date() });

    if (this.activityLogService) {
      await this.activityLogService.record({
        orgId,
        action: ActivityAction.CREDENTIAL_TESTED,
        entityType: ActivityEntityType.CREDENTIAL,
        entityId: id,
        metadata: { name: updated.name, type: updated.type },
      });
    }

    return this.toView(updated);
  }

  async decryptSecret(orgId: string, id: string, expectedType: CredentialType): Promise<Record<string, unknown>> {
    const credential = await this.repo.findByIdOrFail(orgId, id);

    if (credential.type !== expectedType) {
      throw new ValidationError('Credential type mismatch');
    }

    if (!credential.isActive || credential.revokedAt) {
      throw new ValidationError('Credential is inactive or revoked');
    }

    const plainText = this.crypto.decryptToString({
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
      keyVersion: credential.keyVersion,
    });

    const parsed = JSON.parse(plainText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError('Credential payload is invalid');
    }

    return parsed as Record<string, unknown>;
  }

  private toView(credential: Credential): CredentialView {
    return {
      id: credential.id,
      orgId: credential.orgId,
      name: credential.name,
      type: credential.type,
      metadata: this.toJsonObject(credential.metadata),
      isActive: credential.isActive,
      lastTestedAt: credential.lastTestedAt,
      revokedAt: credential.revokedAt,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }

  private toJsonObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
