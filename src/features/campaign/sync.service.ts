import { PrismaClient } from '@prisma/client';
import { ICredentialService } from '../credentials/credentials.service';
import { DbConnectorFactory } from '../../plugins/db-connectors/connector.factory';
import { DbConnectionConfig } from '../../plugins/db-connectors/db-connector.interface';
import { CampaignService } from './campaign.service';
import { TriggerJob } from '../../plugins/worker/jobs';

export class SyncService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly credentialService: ICredentialService,
    private readonly campaignService: CampaignService
  ) {}

  /**
   * Wake up and run a specific sync job.
   * This is typically called by a Cron worker or a manual "Sync Now" button.
   */
  async runSyncJob(jobId: string): Promise<void> {
    const job = await this.prisma.syncJob.findUnique({
      where: { id: jobId },
      include: { dataSource: true }
    });

    if (!job || !job.isActive) {
      logger.warn({ jobId }, 'SyncService: job not found or inactive');
      return;
    }

    const { dataSource } = job;
    logger.info({ jobId, dataSource: dataSource.name }, 'SyncService: starting execution');

    // 1. Mark as Running
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', lastError: null }
    });

    const connector = DbConnectorFactory.getConnector(dataSource.type);
    
    try {
      // 2. Decrypt Credentials
      const secret = await this.credentialService.decryptSecret(
        dataSource.orgId, 
        dataSource.credentialId, 
        'DATABASE_CONNECTOR'
      );

      const config: DbConnectionConfig = {
        host: (dataSource.config as any).host,
        port: (dataSource.config as any).port,
        database: (dataSource.config as any).database,
        user: secret.user as string,
        password: secret.password as string,
        ssl: (dataSource.config as any).ssl
      };

      await connector.connect(config);
      
      // 3. Construct Query with High Watermark
      let sql = job.sqlQuery;
      const params: any[] = [];
      
      if (job.cursorField && job.lastCursor) {
        const cursorClause = `${job.cursorField} > $1`;
        if (sql.toLowerCase().includes('where')) {
           sql = `${sql} AND ${cursorClause}`;
        } else {
           sql = `${sql} WHERE ${cursorClause}`;
        }
        params.push(job.lastCursor);
      }
      
      // Limit batch size for scalability
      sql = `${sql} LIMIT 5000`;

      // 4. Fetch Records
      const rows = await connector.query(sql, params);
      if (rows.length === 0) {
        await this.prisma.syncJob.update({
          where: { id: jobId },
          data: { status: 'SUCCESS', lastSyncAt: new Date() }
        });
        logger.info({ jobId }, 'SyncService: no new records found');
        return;
      }

      // 5. Transform and Pipe to Bot Engine
      const data = rows.map(row => {
        const { wa_id, ...variables } = row;
        return {
          to: String(wa_id || ''),
          variables
        };
      }).filter(item => item.to.length > 0);

      const triggerJob: TriggerJob = {
        orgId: dataSource.orgId,
        botId: job.botId || '', 
        campaignName: `${job.name} - Sync`,
        autoStart: true, // AUTO-LAUNCH IS ENABLED HERE
        data
      };

      await this.campaignService.processApiTrigger(triggerJob);

      // 6. Finalize Success and Update Cursor
      let nextCursor = job.lastCursor;
      if (job.cursorField) {
        const lastRow = rows[rows.length - 1];
        nextCursor = String(lastRow[job.cursorField]);
      }

      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: { 
          status: 'SUCCESS',
          lastCursor: nextCursor,
          lastSyncAt: new Date(),
          totalRecordsProcessed: { increment: rows.length }
        }
      });

      logger.info({ jobId, processed: rows.length }, 'SyncService: sync completed successfully');

    } catch (err: any) {
      const errorMessage = err.message || 'Unknown database error';
      logger.error({ jobId, err }, 'SyncService: execution failed');
      
      // Record failure for UI visibility
      await this.prisma.syncJob.update({
        where: { id: jobId },
        data: { 
          status: 'FAILED', 
          lastError: errorMessage 
        }
      });

      throw err;
    } finally {
      await connector.close();
    }
  }

  /**
   * Background task to find and run due sync jobs.
   * This would be triggered by a top-level cron/scheduler.
   */
  async runDueSyncJobs(): Promise<void> {
    // Find jobs where nextSyncAt <= now or lastSyncAt is null
    const now = new Date();
    const dueJobs = await this.prisma.syncJob.findMany({
      where: {
        isActive: true,
        OR: [
          { nextSyncAt: { lte: now } },
          { lastSyncAt: null }
        ]
      },
      select: { id: true }
    });

    for (const job of dueJobs) {
      // In a real high-scale env, we'd push these to RabbitMQ
      // For now, we process them sequentially or in small parallel batches
      await this.runSyncJob(job.id).catch(err => {
        logger.error({ jobId: job.id, err }, 'SyncService: due job execution failed');
      });
      
      // Calculate next run time based on cron (simplified here to hourly)
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          nextSyncAt: new Date(Date.now() + 60 * 60 * 1000) // Default +1 hour
        }
      });
    }
  }
}
