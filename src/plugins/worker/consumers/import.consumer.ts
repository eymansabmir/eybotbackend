import { IPluginRegistry } from '../../plugin.interface';
import { STORAGE_PLUGIN, IStoragePlugin } from '../../storage';
import { ImportJob, DispatchJob } from '../jobs';
import { EXCHANGES, IWorkerPlugin, WORKER_PLUGIN } from '../worker.interface';
import { CampaignVersionStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { CAMPAIGN_REPOSITORY, CAMPAIGN_RECIPIENT_REPOSITORY } from '../../../features/repositories.interface';
import { ICampaignRepository } from '../../../features/campaign/campaign.repository';
import { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';

export async function handleImportJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as ImportJob;
  logger.info({ campaignId: job.campaignId, versionId: job.campaignVersionId }, 'ImportWorker: starting import');

  try {
    const storage = registry.get<IStoragePlugin>(STORAGE_PLUGIN);
    const campaignRepo = registry.get<ICampaignRepository>(CAMPAIGN_REPOSITORY);
    const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);

    // 1. Download file from storage
    const buffer = await storage.downloadFile(job.filePath);

    // 2. Parse XLSX using buffer
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName!];

    if (!sheet) throw new Error('Sheet not found in XLSX');

    const rows = XLSX.utils.sheet_to_json<any>(sheet);
    logger.info({ campaignId: job.campaignId, rowCount: rows.length, filePath: job.filePath }, 'ImportWorker: file parsed');

    // 3. Batch insert recipients
    const total = rows.length;
    const batchSize = 1000;

    for (let i = 0; i < total; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const recipients = batch.map(row => {
        // Find phone number column case-insensitively
        const keys = Object.keys(row);
        const phoneKey = keys.find(k => {
          const normalized = k.toLowerCase().trim().replace(/[\s_-]/g, '');
          return ['waid', 'phonenumber', 'phone', 'phoneno', 'contact', 'mobile', 'telephone', 'mobileno', 'phonenumbertextformat', 'phonecolumn'].includes(normalized);
        });

        if (!phoneKey) {
          logger.warn({ row, campaignId: job.campaignId }, 'ImportWorker: No phone column found in row. Available columns:', Object.keys(row));
          return null;
        }

        const rawWaId = row[phoneKey];
        const cleanWaId = rawWaId ? String(rawWaId).trim().replace(/\D/g, '') : '';

        if (i === 0 && batch.indexOf(row) === 0) {
          logger.info({ 
            firstRow: row, 
            phoneKey, 
            rawWaId, 
            cleanWaId,
            campaignId: job.campaignId 
          }, 'ImportWorker: Debug - First row processing details');
        }

        return {
          waId: cleanWaId,
          variables: row as any,
        };
      }).filter((r): r is { waId: string; variables: any } => {
        if (!r || !r.waId) {
          logger.warn({ campaignId: job.campaignId, row: r }, 'ImportWorker: skipping row with missing/invalid phone number');
          return false;
        }
        return true;
      });

      if (recipients.length > 0) {
        await recipientRepo.batchCreate(job.campaignVersionId, recipients);
        logger.debug({ campaignId: job.campaignId, batchStart: i, count: recipients.length }, 'ImportWorker: batch inserted');
      }
    }

    // 4. Create Stats and Update Version Status
    await campaignRepo.createStats(job.campaignId, total);
    await campaignRepo.updateVersionStatus(job.campaignVersionId, CampaignVersionStatus.ready);

    logger.info({ campaignId: job.campaignId, totalRecipients: total }, 'ImportWorker: import complete');

    // 5. Auto-start immediate campaigns — scheduled ones are handled by the DB poller
    if (job.autoStart) {
      const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
      const dispatchJob: DispatchJob = {
        campaignId: job.campaignId,
        campaignVersionId: job.campaignVersionId,
        orgId: job.orgId,
      };
      await workerPlugin.publish(EXCHANGES.CAMPAIGN_START, dispatchJob);
      logger.info({ campaignId: job.campaignId }, 'ImportWorker: CAMPAIGN_START enqueued after import');
    }
  } catch (error) {
    logger.error({ campaignId: job.campaignId, error }, 'ImportWorker: import failed');
  }
}
