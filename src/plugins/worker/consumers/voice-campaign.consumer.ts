import type { IPluginRegistry } from '../../plugin.interface';
import { EXCHANGES, WORKER_PLUGIN, type IWorkerPlugin } from '../worker.interface';
import type { VoiceCampaignJob } from '../jobs';
import { REDIS_PLUGIN, type IRedisPlugin } from '../../redis';
import { VOICE_ENTITY_REPOSITORY, VOICE_ROUTING_REPOSITORY, CREDENTIAL_SERVICE } from '../../../features/repositories.interface';
import type { IEntityRepository } from '../../../features/voice-tech/data/entity.repository';
import type { IVoiceRoutingRepository } from '../../../features/voice-tech/data/routing.repository';
import { VoiceRoutingService } from '../../../features/voice-tech/services/voice-routing.service';
import { PhoneDiscoveryService } from '../../../features/voice-tech/services/phone-discovery.service';
import { VOICE_PROVIDERS_PLUGIN, type IVoiceProvidersPlugin } from '../../voice-providers';
import type { ICredentialService } from '../../../features/credentials/credentials.service';
import { logger } from '../../../utils/logger';

const JOB_STATUS_PREFIX = 'voice:campaign:job:';
const JOB_STATUS_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_MAX_RETRIES = 3;

interface CampaignProgress {
  status: 'queued' | 'processing' | 'retrying' | 'completed' | 'failed';
  tenantId: string;
  routingConfigId: string;
  entityTypes: string[];
  totalProcessed: number;
  initiated: number;
  failed: number;
  skipped: number;
  excluded: number;
  retryCount: number;
  reason?: string;
  updatedAt: string;
}

interface CampaignEntityRow {
  id: string;
  attributes: Record<string, unknown>;
}

async function setProgress(redis: IRedisPlugin['client'], jobId: string, progress: CampaignProgress): Promise<void> {
  await redis.set(`${JOB_STATUS_PREFIX}${jobId}`, JSON.stringify(progress), 'EX', JOB_STATUS_TTL_SECONDS);
}

async function scheduleRetry(workerPlugin: IWorkerPlugin, job: VoiceCampaignJob, retryCount: number): Promise<void> {
  await workerPlugin.publish(EXCHANGES.VOICE_CAMPAIGN_RETRY, {
    ...job,
    retryCount,
  });
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function handleVoiceCampaignJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as VoiceCampaignJob;
  const redis = registry.get<IRedisPlugin>(REDIS_PLUGIN).client;
  const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  const entityRepo = registry.get<IEntityRepository>(VOICE_ENTITY_REPOSITORY);
  const routingRepo = registry.get<IVoiceRoutingRepository>(VOICE_ROUTING_REPOSITORY);
  const providersPlugin = registry.get<IVoiceProvidersPlugin>(VOICE_PROVIDERS_PLUGIN);
  const credentialService = registry.get<ICredentialService>(CREDENTIAL_SERVICE);

  const retryCount = job.retryCount ?? 0;
  const maxRetries = job.maxRetries ?? DEFAULT_MAX_RETRIES;
  const concurrency = Math.min(Math.max(Number(process.env.VOICE_CAMPAIGN_CALL_CONCURRENCY ?? '50'), 1), 200);

  const progress: CampaignProgress = {
    status: 'processing',
    tenantId: job.tenantId,
    routingConfigId: job.routingConfigId,
    entityTypes: job.entityTypes,
    totalProcessed: 0,
    initiated: 0,
    failed: 0,
    skipped: 0,
    excluded: 0,
    retryCount,
    updatedAt: new Date().toISOString(),
  };

  await setProgress(redis, job.jobId, progress);

  const voiceRoutingService = new VoiceRoutingService(routingRepo, providersPlugin, credentialService);

  try {
    for (const entityType of job.entityTypes) {
      const entityTypeId = await entityRepo.findEntityTypeId(job.tenantId, entityType);
      if (!entityTypeId) {
        continue;
      }

      // Pre-load routing config ONCE per job to avoid N+1 database queries
      const config = await routingRepo.getRoutingConfig(job.routingConfigId, job.tenantId);
      if (!config) {
        logger.error({ jobId: job.jobId, configId: job.routingConfigId }, 'VoiceCampaignConsumer: config not found');
        continue;
      }

      // Fetch all entities for this type
      const query = `
        SELECT val->>'id' as id, val as attributes
        FROM (
          SELECT jsonb_array_elements(COALESCE(data, '[]'::jsonb)) as val
          FROM "datasets"
          WHERE "tenantId" = $1
          AND "id" = $2
        ) as sub
      `;
      
      const rows = await entityRepo.queryRaw<CampaignEntityRow>(query, job.tenantId, entityTypeId);

      if (rows.length === 0) {
        continue;
      }

      const concurrentChunks = chunkArray(rows, concurrency); // Increased concurrency to 100

      // Pre-load and decrypt all credentials used in the orchestration rules
      const preloadedCredentials: Record<string, any> = {};
      if (credentialService) {
        const credentialIds = new Set<string>();
        config.rules.forEach((r: any) => {
          if (r.voiceProviderId) credentialIds.add(r.voiceProviderId);
          if (r.action?.voiceCredentialId) credentialIds.add(r.action.voiceCredentialId);
          if (r.action?.telephonyCredentialId) credentialIds.add(r.action.telephonyCredentialId);
        });

        await Promise.all(Array.from(credentialIds).map(async (credId) => {
          try {
            // We'll try to decrypt it. We might not know the exact type here, 
            // but the credential service usually handles the mapping if we pass a generic type or check the rule.
            // For now, let's just pre-load them as the routing service will fall back if missing.
            // To be safe, we'll only pre-load if we can determine the type.
            const rule = config.rules.find((r: any) => 
              r.voiceProviderId === credId || 
              r.action?.voiceCredentialId === credId || 
              r.action?.telephonyCredentialId === credId
            );
            if (rule) {
              const type = (rule.voiceProviderId === credId || rule.action?.voiceCredentialId === credId)
                ? voiceRoutingService.resolveVoiceCredentialType(rule.action)
                : voiceRoutingService.resolveTelephonyCredentialType(rule.action);
              
              if (type) {
                preloadedCredentials[credId] = await credentialService.decryptSecret(job.tenantId, credId, type);
              }
            }
          } catch (err) {
            logger.warn({ credId, err }, 'VoiceCampaignConsumer: Failed to pre-load credential');
          }
        }));
        
        logger.info(
          { 
            tenantId: job.tenantId, 
            loadedCount: Object.keys(preloadedCredentials).length,
            credentialIds: Object.keys(preloadedCredentials)
          }, 
          'VoiceCampaignConsumer: Pre-loaded credentials for bulk execution'
        );
      }

      for (const concurrentBatch of concurrentChunks) {
          await Promise.all(
            concurrentBatch.map(async (entity: CampaignEntityRow) => {
              progress.totalProcessed += 1;

              const phone = PhoneDiscoveryService.getE164Phone(entity.attributes);
              if (!phone) {
                progress.skipped += 1;
                return;
              }

              try {
                // Pass the pre-loaded config to avoid redundant DB lookups
                const routeResult = await voiceRoutingService.route({
                  tenantId: job.tenantId,
                  routingConfigId: job.routingConfigId,
                  entityType,
                  attributes: entity.attributes,
                  phone,
                  userId: entity.id,
                  executeProvider: true,
                  preloadedConfig: config as any,
                  skipIntermediateEvents: true, // Optimization: reduce DB load
                  preloadedCredentials // New optimization: avoid per-call decryption
                });

                if (!routeResult.matchedRuleId) {
                  progress.excluded += 1;
                  return;
                }

                if (routeResult.providerResult?.accepted) {
                  progress.initiated += 1;
                } else {
                  progress.failed += 1;
                }
              } catch (err) {
                progress.failed += 1;
                logger.error({ jobId: job.jobId, entityId: entity.id, err }, 'VoiceCampaignConsumer: call execution failed for entity');
              }
            }),
          );

          progress.updatedAt = new Date().toISOString();
          await setProgress(redis, job.jobId, progress);
      }
    }

    progress.status = 'completed';
    progress.updatedAt = new Date().toISOString();
    await setProgress(redis, job.jobId, progress);

    logger.info({ jobId: job.jobId, ...progress }, 'VoiceCampaignConsumer: campaign completed');
  } catch (err) {
    if (retryCount < maxRetries) {
      progress.status = 'retrying';
      progress.retryCount = retryCount + 1;
      progress.reason = err instanceof Error ? err.message : 'Unknown error';
      progress.updatedAt = new Date().toISOString();
      await setProgress(redis, job.jobId, progress);
      await scheduleRetry(workerPlugin, job, retryCount + 1);
      logger.warn({ jobId: job.jobId, retryCount: retryCount + 1, maxRetries, err }, 'VoiceCampaignConsumer: failed, scheduled retry');
      return;
    }

    await workerPlugin.publish(EXCHANGES.VOICE_CAMPAIGN_DLQ, {
      ...job,
      retryCount,
      reason: err instanceof Error ? err.message : 'Unknown error',
      failedAt: new Date().toISOString(),
    });

    progress.status = 'failed';
    progress.reason = err instanceof Error ? err.message : 'Unknown error';
    progress.updatedAt = new Date().toISOString();
    await setProgress(redis, job.jobId, progress);

    logger.error({ jobId: job.jobId, err }, 'VoiceCampaignConsumer: campaign failed');
  }
}
