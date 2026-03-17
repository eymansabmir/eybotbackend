import { CredentialType } from '@prisma/client';
import { Readable } from 'stream';
import type { ICredentialService } from '../../features/credentials';
import { AppError, ValidationError } from '../../utils/errors';
import type { IStoragePlugin } from '../storage';
import type {
  ElevenLabsCredentialMaterial,
  ElevenLabsModelInfo,
  ElevenLabsTestResult,
  ElevenLabsVoiceInfo,
  ExecuteElevenLabsNodePayload,
  ExecuteElevenLabsNodeResult,
  IElevenLabsIntegrationService,
  IElevenLabsProvider,
} from './elevenlabs.types';

export class ElevenLabsIntegrationService implements IElevenLabsIntegrationService {
  constructor(
    private readonly credentials: ICredentialService,
    private readonly provider: IElevenLabsProvider,
    private readonly storage?: IStoragePlugin,
  ) {}

  async testCredential(orgId: string, credentialId: string): Promise<ElevenLabsTestResult> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    const result = await this.provider.testConnection({ credential: material });

    if (result.ok) {
      await this.credentials.markTested(orgId, credentialId);
    }

    return result;
  }

  async listModels(orgId: string, credentialId: string): Promise<ElevenLabsModelInfo[]> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    return this.provider.listModels({ credential: material });
  }

  async listVoices(orgId: string, credentialId: string): Promise<ElevenLabsVoiceInfo[]> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    return this.provider.listVoices({ credential: material });
  }

  async executeNode(input: ExecuteElevenLabsNodePayload): Promise<ExecuteElevenLabsNodeResult> {
    if (!this.storage) {
      throw new AppError('Storage plugin is required for ElevenLabs speech generation', 500);
    }

    if (!input.text.trim()) {
      throw new ValidationError('text is required');
    }

    const material = await this.getCredentialMaterial(input.orgId, input.credentialId);
    const speech = await this.provider.createSpeech({
      credential: material,
      voiceId: input.voiceId,
      text: input.text,
      modelId: input.modelId,
      outputFormat: input.outputFormat,
      timeoutMs: input.timeoutMs,
    });

    const extension = this.mimeToExtension(speech.mimeType);
    const uploaded = await this.storage.uploadFile(
      {
        fieldname: 'audio',
        originalname: `elevenlabs-tts-${Date.now()}.${extension}`,
        encoding: '7bit',
        mimetype: speech.mimeType,
        size: speech.audioBuffer.length,
        destination: '',
        filename: '',
        path: '',
        buffer: speech.audioBuffer,
        stream: Readable.from([]),
      },
      `integrations/elevenlabs/${input.orgId}/voice`,
    );

    return {
      audioUrl: uploaded.url,
      mimeType: speech.mimeType,
      voiceId: speech.voiceId,
      modelId: speech.modelId,
    };
  }

  private async getCredentialMaterial(orgId: string, credentialId: string): Promise<ElevenLabsCredentialMaterial> {
    const secret = await this.credentials.decryptSecret(orgId, credentialId, CredentialType.ELEVENLABS);
    const apiKey = secret['apiKey'];

    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new ValidationError('ElevenLabs credential payload is invalid');
    }

    return {
      apiKey: apiKey.trim(),
      ...(typeof secret['baseUrl'] === 'string' ? { baseUrl: secret['baseUrl'] } : {}),
    };
  }

  private mimeToExtension(mimeType: string): string {
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('ogg') || mimeType.includes('opus')) return 'opus';
    if (mimeType.includes('flac')) return 'flac';
    return 'audio';
  }
}
