import { ICredentialService } from '../credentials/credentials.service';
import { DbConnectorFactory } from '../../plugins/db-connectors/connector.factory';
import { DbConnectionConfig } from '../../plugins/db-connectors/db-connector.interface';
import { CampaignService } from './campaign.service';
import { ISyncJobRepository } from './sync-job.repository';
import { logger } from '../../utils/logger';

export class SyncService {
  constructor(
    private readonly repository: ISyncJobRepository,
    private readonly credentialService: ICredentialService,
    private readonly campaignService: CampaignService
  ) {}

  /**
   * Wake up and run a specific sync job.
   */
  async runSyncJob(jobId: string): Promise<void> {
    const job = await this.repository.findById(jobId);

    if (!job || !job.isActive) {
      logger.warn({ jobId }, 'SyncService: job not found or inactive');
      return;
    }

    const { dataSource } = job;
    logger.info({ jobId, dataSource: dataSource.name }, 'SyncService: starting execution');

    // 1. Mark as Running
    await this.repository.updateStatus(jobId, { status: 'RUNNING' });

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
        // SECURITY: Validate cursorField to prevent structural SQL injection
        // Only allow alphanumeric and underscores
        if (!/^[a-zA-Z0-9_]+$/.test(job.cursorField)) {
          throw new Error(`Invalid cursor field: ${job.cursorField}`);
        }

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
        await this.repository.updateStatus(jobId, { status: 'SUCCESS', lastSyncAt: new Date() });
        logger.info({ jobId }, 'SyncService: no new records found');
        return;
      }

      // 5. Transform and Pipe to Bot Engine
      let processedCount = 0;
      for (const row of rows) {
        const variables: Record<string, any> = {};
        let to: string | undefined;

        Object.keys(row).forEach(key => {
          const normalizedKey = key.toLowerCase();
          if (['wa_id', 'phone', 'mobile', 'recipient'].includes(normalizedKey)) {
            to = String(row[key]);
          }
          variables[normalizedKey] = row[key];
        });

        if (to) {
          await this.campaignService.processApiTrigger({
            orgId: dataSource.orgId,
            botId: job.botId || '',
            data: [{ to, variables }],
            executionMode: 'NOW',
            campaignName: `Sync: ${job.name} (${new Date().toLocaleDateString()})`
          });
          processedCount++;
        }
      }

      // 6. Finalize Success and Update Cursor
      let nextCursor = job.lastCursor;
      if (job.cursorField) {
        const lastRow = rows[rows.length - 1];
        nextCursor = String(lastRow[job.cursorField]);
      }

      await this.repository.updateCursorAndStats(jobId, {
        lastCursor: nextCursor,
        lastSyncAt: new Date(),
        incrementProcessed: rows.length
      });

      logger.info({ jobId, processed: rows.length }, 'SyncService: sync completed successfully');

    } catch (err: any) {
      const errorMessage = err.message || 'Unknown database error';
      logger.error({ jobId, err }, 'SyncService: execution failed');
      
      await this.repository.updateStatus(jobId, { 
        status: 'FAILED', 
        lastError: errorMessage 
      });

      throw err;
    } finally {
      await connector.close();
    }
  }

  /**
   * Background task to find and run due sync jobs.
   */
  async runDueSyncJobs(): Promise<void> {
    const now = new Date();
    const dueJobs = await this.repository.findDueJobs(now);

    for (const job of dueJobs) {
      await this.runSyncJob(job.id).catch(err => {
        logger.error({ jobId: job.id, err }, 'SyncService: due job execution failed');
      });
      
      // Calculate next run time (simplified to hourly)
      await this.repository.updateNextSync(job.id, new Date(Date.now() + 60 * 60 * 1000));
    }
  }
}

