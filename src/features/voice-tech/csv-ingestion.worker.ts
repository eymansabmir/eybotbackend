import type { IngestionService } from './services/ingestion.service';

export async function processCsvIngestionJob(
  ingestionService: IngestionService,
  job: { tenantId: string; entityType: string; filePath: string },
): Promise<{ inserted: number; entityTypeId: string }> {
  return ingestionService.processFromFile({
    tenantId: job.tenantId,
    entityType: job.entityType,
    filePath: job.filePath,
  });
}