import type { IPluginRegistry } from '../../plugin.interface';
import { VOICE_ENTITY_REPOSITORY } from '../../../features/repositories.interface';
import type { IEntityRepository } from '../../../features/voice-tech/data/entity.repository';
import { IngestionService } from '../../../features/voice-tech/services/ingestion.service';
import type { VoiceIngestJob } from '../jobs';
import { STORAGE_PLUGIN, type IStoragePlugin } from '../../storage';
import { REDIS_PLUGIN, type IRedisPlugin } from '../../redis';
import { EXCHANGES, WORKER_PLUGIN, type IWorkerPlugin } from '../worker.interface';

const JOB_STATUS_PREFIX = 'voice:ingest:job:';
const JOB_STATUS_TTL_SECONDS = 60 * 60 * 24;
const TENANT_INFLIGHT_PREFIX = 'voice:ingest:tenant:inflight:';
const TENANT_INFLIGHT_TTL_SECONDS = 300;
const DEFAULT_MAX_RETRIES = 3;

async function releaseTenantSlot(redis: IRedisPlugin['client'], tenantId: string): Promise<void> {
  const key = `${TENANT_INFLIGHT_PREFIX}${tenantId}`;
  const value = await redis.decr(key);
  if (value <= 0) {
    await redis.del(key);
  }
}

async function scheduleRetry(
  workerPlugin: IWorkerPlugin,
  job: VoiceIngestJob,
  retryCount: number,
): Promise<void> {
  await workerPlugin.publish(EXCHANGES.VOICE_INGEST_RETRY, {
    ...job,
    retryCount,
  });
}

export async function handleVoiceIngestJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as VoiceIngestJob;
  const redis = registry.get<IRedisPlugin>(REDIS_PLUGIN).client;
  const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  const retryCount = job.retryCount ?? 0;
  const maxRetries = job.maxRetries ?? DEFAULT_MAX_RETRIES;
  const tenantLimit = Number(process.env.VOICE_INGEST_MAX_CONCURRENT_PER_TENANT ?? '2');
  const tenantInflightKey = `${TENANT_INFLIGHT_PREFIX}${job.tenantId}`;

  const inflight = await redis.incr(tenantInflightKey);
  if (inflight === 1) {
    await redis.expire(tenantInflightKey, TENANT_INFLIGHT_TTL_SECONDS);
  }

  if (inflight > tenantLimit) {
    await releaseTenantSlot(redis, job.tenantId);

    await redis.set(
      `${JOB_STATUS_PREFIX}${job.jobId}`,
      JSON.stringify({
        status: 'retrying',
        tenantId: job.tenantId,
        entityType: job.entityType,
        retryCount,
        reason: 'tenant-concurrency-limit',
        updatedAt: new Date().toISOString(),
      }),
      'EX',
      JOB_STATUS_TTL_SECONDS,
    );

    await scheduleRetry(workerPlugin, job, retryCount + 1);
    logger.warn({ jobId: job.jobId, tenantId: job.tenantId, inflight, tenantLimit }, 'VoiceIngestConsumer: tenant throttled, scheduled retry');
    return;
  }

  const statusKey = `${JOB_STATUS_PREFIX}${job.jobId}`;
  await redis.set(
    statusKey,
    JSON.stringify({
      status: 'processing',
      tenantId: job.tenantId,
      entityType: job.entityType,
      retryCount,
      updatedAt: new Date().toISOString(),
    }),
    'EX',
    JOB_STATUS_TTL_SECONDS,
  );

  try {
    const entityRepo = registry.get<IEntityRepository>(VOICE_ENTITY_REPOSITORY);
    const storagePlugin = registry.get<IStoragePlugin>(STORAGE_PLUGIN);
    const ingestionService = new IngestionService(entityRepo, storagePlugin);

    const result = job.filePath
      ? await ingestionService.processFromFile({
        tenantId: job.tenantId,
        entityType: job.entityType,
        filePath: job.filePath,
      })
      : await ingestionService.process({
        tenantId: job.tenantId,
        entityType: job.entityType,
        records: job.records ?? [],
      });

    await redis.set(
      statusKey,
      JSON.stringify({
        status: 'completed',
        tenantId: job.tenantId,
        entityType: job.entityType,
        inserted: result.inserted,
        entityTypeId: result.entityTypeId,
        retryCount,
        updatedAt: new Date().toISOString(),
      }),
      'EX',
      JOB_STATUS_TTL_SECONDS,
    );

    logger.info({ jobId: job.jobId, inserted: result.inserted }, 'VoiceIngestConsumer: ingestion completed');
  } catch (err) {
    if (retryCount < maxRetries) {
      await redis.set(
        statusKey,
        JSON.stringify({
          status: 'retrying',
          tenantId: job.tenantId,
          entityType: job.entityType,
          retryCount: retryCount + 1,
          reason: err instanceof Error ? err.message : 'Unknown error',
          updatedAt: new Date().toISOString(),
        }),
        'EX',
        JOB_STATUS_TTL_SECONDS,
      );

      await scheduleRetry(workerPlugin, job, retryCount + 1);
      logger.warn({ jobId: job.jobId, retryCount: retryCount + 1, maxRetries }, 'VoiceIngestConsumer: job failed, scheduled retry');
      await releaseTenantSlot(redis, job.tenantId);
      return;
    }

    await workerPlugin.publish(EXCHANGES.VOICE_INGEST_DLQ, {
      ...job,
      retryCount,
      reason: err instanceof Error ? err.message : 'Unknown error',
      failedAt: new Date().toISOString(),
    });

    await redis.set(
      statusKey,
      JSON.stringify({
        status: 'failed',
        tenantId: job.tenantId,
        entityType: job.entityType,
        retryCount,
        reason: err instanceof Error ? err.message : 'Unknown error',
        updatedAt: new Date().toISOString(),
      }),
      'EX',
      JOB_STATUS_TTL_SECONDS,
    );

    logger.error({ jobId: job.jobId, err }, 'VoiceIngestConsumer: ingestion failed');
    await releaseTenantSlot(redis, job.tenantId);
    return;
  }

  await releaseTenantSlot(redis, job.tenantId);
}
