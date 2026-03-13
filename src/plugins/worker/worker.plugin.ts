import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import { type ExchangeName, type IWorkerPlugin } from './worker.interface';
import { RabbitMQBroker } from './broker';
import { handleInboundJob } from './consumers/inbound.consumer';
import { handleOutboundJob } from './consumers/outbound.consumer';
import { handleCampaignJob } from './consumers/campaign.consumer';

export class WorkerPlugin implements IPlugin, IWorkerPlugin {
  readonly name = 'worker';

  private broker!: RabbitMQBroker;

  async initialize(registry: IPluginRegistry): Promise<void> {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      console.warn('[WorkerPlugin] RABBITMQ_URL not set — workers disabled');
      this.broker = null as any;
      return;
    }

    this.broker = new RabbitMQBroker();
    await this.broker.connect(url);
    await this.broker.setupTopology();

    // Register consumers — each runs in its own channel with its own prefetch
    await this.broker.consume('wa.inbound.q', data => handleInboundJob(data, registry), 10);
    await this.broker.consume('wa.outbound.q', data => handleOutboundJob(data, registry), 20);
    await this.broker.consume(this.broker.campaignQueue, data => handleCampaignJob(data, registry), 5);

    console.log('[WorkerPlugin] All consumers started');
  }

  async shutdown(): Promise<void> {
    if (this.broker) {
      await this.broker.close();
      console.log('[WorkerPlugin] RabbitMQ connection closed');
    }
  }

  async publish(exchange: ExchangeName, data: unknown, routingKey = ''): Promise<void> {
    if (!this.broker) {
      console.warn(`[WorkerPlugin] No broker — dropping publish to ${exchange}`);
      return;
    }
    await this.broker.publish(exchange, routingKey, data);
  }
}
