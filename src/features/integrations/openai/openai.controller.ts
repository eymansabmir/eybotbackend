import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IOpenAIIntegrationService } from '../../../plugins/openai';

const pickFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const PathSchema = z.object({
  id: z.string().min(1),
});

const OrgIdBodySchema = z.object({
  orgId: z.string().min(1),
});

const ListCredentialsQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1)),
});

const CreateCredentialBodySchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  organization: z.string().optional(),
  project: z.string().optional(),
});

const ListModelsQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1)),
  credentialId: z.preprocess(pickFirst, z.string().min(1)),
});

const OpenAIMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().min(1),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
});

const PreviewBodySchema = z.object({
  orgId: z.string().min(1),
  credentialId: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(OpenAIMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const ListSpeechModelsQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1)),
  credentialId: z.preprocess(pickFirst, z.string().min(1)),
  actionMode: z.preprocess(pickFirst, z.enum(['create_speech', 'create_transcription']).optional()),
  timeoutMs: z.preprocess(
    pickFirst,
    z
      .string()
      .regex(/^\d+$/)
      .transform((v) => Number(v))
      .optional(),
  ),
});

const CreateSpeechRequestSchema = z.object({
  orgId: z.string().min(1),
  credentialId: z.string().min(1),
  model: z.string().min(1),
  voice: z.string().min(1),
  input: z.string().min(1).max(5000),
  format: z.enum(['mp3', 'wav', 'opus', 'aac', 'flac', 'pcm']).optional(),
  speed: z.number().min(0.25).max(4).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const CreateTranscriptionBodySchema = z.object({
  orgId: z.string().min(1),
  credentialId: z.string().min(1),
  model: z.string().min(1),
  audioUrl: z.string().url().optional(),
  language: z.string().min(2).max(10).optional(),
  prompt: z.string().max(2000).optional(),
  timeoutMs: z
    .union([z.string().regex(/^\d+$/).transform((v) => Number(v)), z.number().int().positive()])
    .optional(),
});

export class OpenAIController {
  constructor(private readonly service: IOpenAIIntegrationService) {}

  createCredential = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateCredentialBodySchema.parse(req.body);
      const credential = await this.service.createCredential(body);
      res.status(201).json(credential);
    } catch (err) {
      next(err);
    }
  };

  listCredentials = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId } = ListCredentialsQuerySchema.parse(req.query);
      const credentials = await this.service.listCredentials(orgId);
      res.json(credentials);
    } catch (err) {
      next(err);
    }
  };

  testCredential = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PathSchema.parse(req.params);
      const { orgId } = OrgIdBodySchema.parse(req.body);
      const result = await this.service.testCredential(orgId, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  listModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, credentialId } = ListModelsQuerySchema.parse(req.query);
      const models = await this.service.listModels(orgId, credentialId);
      res.json(models);
    } catch (err) {
      next(err);
    }
  };

  preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = PreviewBodySchema.parse(req.body);
      const output = await this.service.preview(body);
      res.json(output);
    } catch (err) {
      next(err);
    }
  };

  listSpeechModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListSpeechModelsQuerySchema.parse(req.query);
      const models = await this.service.listSpeechModels(query);
      res.json(models);
    } catch (err) {
      next(err);
    }
  };

  createSpeech = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateSpeechRequestSchema.parse(req.body);
      const result = await this.service.createSpeech(body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  createTranscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateTranscriptionBodySchema.parse(req.body);
      let audioBuffer: Buffer;
      let fileName: string;
      let mimeType: string;

      if (req.file) {
        audioBuffer = req.file.buffer;
        fileName = req.file.originalname;
        mimeType = req.file.mimetype;
      } else if (body.audioUrl) {
        const response = await fetch(body.audioUrl);
        if (!response.ok) {
          throw new z.ZodError([
            {
              code: z.ZodIssueCode.custom,
              path: ['audioUrl'],
              message: 'Could not fetch audio from provided URL',
            },
          ]);
        }

        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
        mimeType = response.headers.get('content-type') || 'audio/mpeg';
        const lastSegment = body.audioUrl.split('/').pop();
        fileName = lastSegment && lastSegment.length > 0 ? lastSegment : `audio-${Date.now()}.mp3`;
      } else {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: ['audioFile'],
            message: 'audioFile or audioUrl is required',
          },
        ]);
      }

      const result = await this.service.createTranscription({
        orgId: body.orgId,
        credentialId: body.credentialId,
        model: body.model,
        audioBuffer,
        fileName,
        mimeType,
        language: body.language,
        prompt: body.prompt,
        timeoutMs: body.timeoutMs,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  revokeCredential = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PathSchema.parse(req.params);
      const { orgId } = OrgIdBodySchema.parse(req.body);
      const credential = await this.service.revokeCredential(orgId, id);
      res.json(credential);
    } catch (err) {
      next(err);
    }
  };
}
