import { IPluginRegistry } from '../../plugin.interface';
import { STORAGE_PLUGIN, IStoragePlugin } from '../../storage';
import { ImportJob } from '../jobs';
import { EXCHANGES, IWorkerPlugin, WORKER_PLUGIN } from '../worker.interface';
import { CampaignVersionStatus } from '@prisma/client';
import { CAMPAIGN_REPOSITORY, CAMPAIGN_RECIPIENT_REPOSITORY } from '../../../features/repositories.interface';
import { ICampaignRepository } from '../../../features/campaign/campaign.repository';
import { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';
import { streamTabularRows } from '../../../utils/tabular-parser';

export async function handleImportJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as ImportJob;
  logger.info({ campaignId: job.campaignId, versionId: job.campaignVersionId }, 'ImportWorker: starting streaming import');

  try {
    const storage = registry.get<IStoragePlugin>(STORAGE_PLUGIN);
    const campaignRepo = registry.get<ICampaignRepository>(CAMPAIGN_REPOSITORY);
    const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);

    // 2. Get stream from storage
    const stream = await storage.getReadStream(job.filePath);

    // 3. Process stream in batches
    let totalProcessed = 0;

    await streamTabularRows(stream, job.filePath, async (batch) => {
      const recipients = batch.map(row => {
        // Resolve phone number (fuzzy search)
        const waIdKey = findPhoneKey(row);
        const rawWaId = row[waIdKey];
        const cleanWaId = rawWaId ? String(rawWaId).trim().replace(/\D/g, '') : '';

        if (!cleanWaId) return null;

        // Zero-Config Variable Injection
        const variables: Record<string, any> = {};
        
        // Map 'req_xxx' columns to 'xxx' bot variables
        Object.keys(row).forEach(key => {
          const lowerKey = key.toLowerCase().trim();
          if (lowerKey.startsWith('req_')) {
            const cleanVarName = lowerKey.replace('req_', '');
            variables[cleanVarName] = row[key];
          }
        });

        return {
          waId: cleanWaId,
          variables: variables as any,
        };
      }).filter((r): r is { waId: string; variables: any } => !!r?.waId);

      if (recipients.length > 0) {
        await recipientRepo.batchCreate(job.campaignVersionId, recipients);
        totalProcessed += recipients.length;
        logger.debug({ campaignId: job.campaignId, batchSize: recipients.length, totalSoFar: totalProcessed }, 'ImportWorker: batch inserted');
      }
    });

    // 4. Create Stats and Update Version Status
    await campaignRepo.createStats(job.campaignId, totalProcessed);
    await campaignRepo.updateVersionStatus(job.campaignVersionId, CampaignVersionStatus.ready);

    logger.info({ campaignId: job.campaignId, totalRecipients: totalProcessed }, 'ImportWorker: streaming import complete');

    // 5. Auto-start immediate campaigns
    if (job.autoStart) {
      const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
      await workerPlugin.publish(EXCHANGES.CAMPAIGN_START, {
        campaignId: job.campaignId,
        campaignVersionId: job.campaignVersionId,
        orgId: job.orgId,
      });
    }
  } catch (error) {
    logger.error({ campaignId: job.campaignId, error }, 'ImportWorker: streaming import failed');
  }
}

/**
 * Fuzzy search for a phone number column if not explicitly mapped
 */
function findPhoneKey(row: Record<string, any>): string {
  const keys = Object.keys(row);
  const commonPhoneHeaders = ['waid', 'phonenumber', 'phone', 'phoneno', 'contact', 'mobile', 'telephone', 'mobileno'];
  
  const matchedKey = keys.find(k => {
    const normalized = k.toLowerCase().trim().replace(/[\s_-]/g, '');
    return commonPhoneHeaders.includes(normalized);
  });
  
  return matchedKey || keys[0] || ''; // Fallback to first column or empty string
}
