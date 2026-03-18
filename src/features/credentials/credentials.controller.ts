import { Request, Response, NextFunction } from 'express';
import { CredentialType, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ICredentialService } from './credentials.service';

const pickFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const PathSchema = z.object({
  id: z.string().min(1),
});

const ListQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1)),
  type: z.preprocess(pickFirst, z.nativeEnum(CredentialType).optional()),
  includeInactive: z.preprocess(pickFirst, z.enum(['true', 'false']).optional()),
  includeRevoked: z.preprocess(pickFirst, z.enum(['true', 'false']).optional()),
});

const GetQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1)),
});

const CreateBodySchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1),
  type: z.nativeEnum(CredentialType),
  secret: z.record(z.string(), z.unknown()),
  metadata: z.custom<Prisma.InputJsonValue>().optional(),
  isActive: z.boolean().optional(),
});

const UpdateBodySchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).optional(),
  metadata: z.custom<Prisma.InputJsonValue | null>().optional(),
  isActive: z.boolean().optional(),
});

const OrgBodySchema = z.object({
  orgId: z.string().min(1),
});

export class CredentialController {
  constructor(private readonly service: ICredentialService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateBodySchema.parse(req.body);
      const credential = await this.service.createCredential(body);
      res.status(201).json(credential);
    } catch (err) {
      next(err);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListQuerySchema.parse(req.query);
      const credentials = await this.service.listCredentials(query.orgId, {
        type: query.type,
        includeInactive: query.includeInactive === 'true',
        includeRevoked: query.includeRevoked === 'true',
      });
      res.json(credentials);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PathSchema.parse(req.params);
      const { orgId } = GetQuerySchema.parse(req.query);
      const credential = await this.service.getCredential(orgId, id);
      res.json(credential);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PathSchema.parse(req.params);
      const body = UpdateBodySchema.parse(req.body);
      const credential = await this.service.updateCredential(body.orgId, id, {
        name: body.name,
        metadata: body.metadata,
        isActive: body.isActive,
      });
      res.json(credential);
    } catch (err) {
      next(err);
    }
  };

  revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PathSchema.parse(req.params);
      const { orgId } = OrgBodySchema.parse(req.body);
      const credential = await this.service.revokeCredential(orgId, id);
      res.json(credential);
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PathSchema.parse(req.params);
      const { orgId } = OrgBodySchema.parse(req.body);
      const credential = await this.service.deleteCredential(orgId, id);
      res.json(credential);
    } catch (err) {
      next(err);
    }
  };
}
