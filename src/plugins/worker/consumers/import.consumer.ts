import { IPluginRegistry } from '../../plugin.interface';
import { STORAGE_PLUGIN, IStoragePlugin } from '../../storage';
import { ImportJob, DispatchJob } from '../jobs';
import { EXCHANGES, IWorkerPlugin, WORKER_PLUGIN } from '../worker.interface';
import { CampaignVersionStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { CAMPAIGN_REPOSITORY, CAMPAIGN_RECIPIENT_REPOSITORY } from '../../../features/repositories.interface';
import { ICampaignRepository } from '../../../features/campaign/campaign.repository';
import { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';

type ParsedRow = Record<string, unknown>;

function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object' && 'result' in value) {
    return value.result;
  }

  return value;
}

async function parseXlsxRows(buffer: Buffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Sheet not found in XLSX');
  }

  const headerRow = worksheet.getRow(1);
  const headerValues = Array.isArray(headerRow.values) ? headerRow.values : Object.values(headerRow.values);
  const headers: string[] = headerValues
    .slice(1)
    .map((value: ExcelJS.CellValue) => String(normalizeCellValue(value) ?? '').trim());

  const rows: ParsedRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const parsed: ParsedRow = {};
    let hasValue = false;

    headers.forEach((header: string, index: number) => {
      if (!header) {
        return;
      }

      const cellValue = row.getCell(index + 1).value;
      const normalizedValue = normalizeCellValue(cellValue);

      parsed[header] = normalizedValue;
      hasValue = hasValue || normalizedValue !== null && normalizedValue !== undefined && String(normalizedValue).trim() !== '';
    });

    if (hasValue) {
      rows.push(parsed);
    }
  }

  return rows;
}

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
    const rows = await parseXlsxRows(buffer);
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
