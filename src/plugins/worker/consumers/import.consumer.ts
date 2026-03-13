import { IPluginRegistry } from '../../plugin.interface';
import { STORAGE_PLUGIN, IStoragePlugin } from '../../storage';
import { ImportJob } from '../jobs';
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
      await recipientRepo.batchCreate(job.campaignVersionId, batch.map(row => ({
        waId: String(row.waId || row['Phone Number'] || row.phone).replace(/\D/g, ''),
        variables: row as any,
      })));
      logger.debug({ campaignId: job.campaignId, batchStart: i, batchEnd: i + batch.length }, 'ImportWorker: batch inserted');
    }

    // 4. Create Stats and Update Version Status
    await campaignRepo.createStats(job.campaignId, total);
    await campaignRepo.updateVersionStatus(job.campaignVersionId, CampaignVersionStatus.ready);

    logger.info({ campaignId: job.campaignId, totalRecipients: total }, 'ImportWorker: import complete');
  } catch (error) {
    logger.error({ campaignId: job.campaignId, error }, 'ImportWorker: import failed');
  }
}
