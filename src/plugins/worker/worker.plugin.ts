import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import { type ExchangeName, type IWorkerPlugin } from './worker.interface';
import { RabbitMQBroker } from './broker';
import { handleInboundJob } from './consumers/inbound.consumer';
import { handleOutboundJob } from './consumers/outbound.consumer';
import { handleImportJob } from './consumers/import.consumer';
import { handleDispatchJob } from './consumers/dispatcher.consumer';
import { handleExecutionJob } from './consumers/execution.consumer';

export class WorkerPlugin implements IPlugin, IWorkerPlugin {
  readonly name = 'worker';

  private broker: RabbitMQBroker | null = null;

  async initialize(registry: IPluginRegistry): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      logger.warn('WorkerPlugin: RABBITMQ_URL not set — workers disabled');
      return;
    }

    try {
      this.broker = new RabbitMQBroker();
      await this.broker.connect(url);
      await this.broker.setupTopology();

      const role = process.env.WORKER_ROLE || 'all';

      // Granular consumer registration based on role
      if (role === 'all' || role === 'inbound') {
        await this.broker.consume('wa.inbound.q', data => handleInboundJob(data, registry), 10);
      }

      if (role === 'all' || role === 'outbound') {
        await this.broker.consume('wa.outbound.q', data => handleOutboundJob(data, registry), 20);
      }

      if (role === 'all' || role === 'campaign') {
        await this.broker.consume('campaign.import.q', data => handleImportJob(data, registry), 1);
        await this.broker.consume('campaign.start.q', data => handleDispatchJob(data, registry), 5);
        await this.broker.consume('campaign.dispatch.q', data => handleExecutionJob(data, registry), 50);
      }

      logger.info({ role }, 'WorkerPlugin: consumers started');
    } catch (err) {
      logger.error({ err }, 'WorkerPlugin: RabbitMQ unavailable — workers disabled');
      this.broker = null;
    }
  }

  async shutdown(): Promise<void> {
    if (this.broker) {
      await this.broker.close();
      logger.info('WorkerPlugin: RabbitMQ connection closed');
    }
  }

  async publish(exchange: ExchangeName, data: unknown, routingKey = ''): Promise<void> {
    if (!this.broker) {
      logger.warn({ exchange }, 'WorkerPlugin: no broker — dropping publish');
      return;
    }
    logger.debug({ exchange, routingKey }, 'Publishing message to exchange');
    await this.broker.publish(exchange, routingKey, data);
  }
}
