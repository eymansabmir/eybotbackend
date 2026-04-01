import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../utils/errors';
import type { IHttpRequestIntegrationService } from '../../../plugins/http-request/http-request.types';

const MethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'CONNECT', 'OPTIONS', 'TRACE']);

const PreviewBodySchema = z.object({
  orgId: z.string().min(1),
  credentialId: z.string().min(1).optional(),
  proxyCredentialsId: z.string().min(1).optional(),
  url: z.string().min(1),
  method: MethodSchema,
  headers: z.record(z.string()).optional(),
  queryParams: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export class HttpRequestController {
  constructor(private readonly service: IHttpRequestIntegrationService) {}

  preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = PreviewBodySchema.parse(req.body);
      const result = await this.service.executeNode({
        orgId: payload.orgId,
        credentialId: payload.credentialId,
        proxyCredentialsId: payload.proxyCredentialsId,
        url: payload.url,
        method: payload.method,
        headers: payload.headers,
        queryParams: payload.queryParams,
        body: payload.body,
        timeoutMs: payload.timeoutMs,
      });

      res.json({
        statusCode: result.statusCode,
        data: result.body,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('Invalid request parameters', 400));
      }
      next(error);
    }
  };
}
