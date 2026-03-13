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
  console.log(`[ImportWorker] Importing campaign ${job.campaignId} (version ${job.campaignVersionId})`);

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
    console.log(`[ImportWorker] Found ${rows.length} rows in ${job.filePath}`);

    // 3. Batch insert recipients
    const total = rows.length;
    const batchSize = 1000;
    
    for (let i = 0; i < total; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      await recipientRepo.batchCreate(job.campaignVersionId, batch.map(row => ({
        waId: String(row.waId || row['Phone Number'] || row.phone).replace(/\D/g, ''),
        variables: row as any,
      })));
    }

    // 4. Create Stats and Update Version Status
    await campaignRepo.createStats(job.campaignId, total);
    await campaignRepo.updateVersionStatus(job.campaignVersionId, CampaignVersionStatus.ready);

    console.log(`[ImportWorker] Import complete for campaign ${job.campaignId}`);
  } catch (error) {
    console.error(`[ImportWorker] Failed to import campaign ${job.campaignId}:`, error);
  }
}
