import amqp from 'amqplib';
import { EXCHANGES } from './worker.interface';

export type MessageHandler = (data: unknown) => Promise<void>;

/**
 * Thin wrapper around amqplib.
 * Handles connection, channel creation, topology declaration,
 * publishing, and consumer registration.
 *
 * Reconnect strategy: on connection error/close, we attempt
 * exponential backoff reconnects automatically.
 */
export class RabbitMQBroker {
  private connection: amqp.ChannelModel | null = null;
  private publishChannel: amqp.Channel | null = null;
  private url!: string;
  private reconnectDelay = 2000;
  private isShuttingDown = false;
  private _campaignQueue: string | null = null;

  async connect(url: string): Promise<void> {
    this.url = url;
    await this.createConnection();
  }

  async close(): Promise<void> {
    this.isShuttingDown = true;
    try {
      await this.publishChannel?.close();
      await this.connection?.close();
    } catch {
      // ignore errors during shutdown
    }
  }

  async publish(exchange: string, routingKey: string, data: unknown): Promise<void> {
    if (!this.publishChannel) {
      throw new Error('[RabbitMQBroker] Not connected — cannot publish');
    }
    const buffer = Buffer.from(JSON.stringify(data));
    this.publishChannel.publish(exchange, routingKey, buffer, { persistent: true, contentType: 'application/json' });
  }

  /**
   * Subscribe to a queue.
   * Each call creates a dedicated consumer channel so consumers are isolated.
   */
  async consume(queue: string, handler: MessageHandler, prefetch = 10): Promise<void> {
    if (!this.connection) {
      throw new Error('[RabbitMQBroker] Not connected — cannot consume');
    }

    const channel = await this.connection.createChannel();
    await channel.prefetch(prefetch);

    channel.on('error', (err: unknown) => console.error(`[RabbitMQBroker] Consumer channel error on ${queue}:`, err));

    await channel.consume(queue, async (msg: amqp.Message | null) => {
      if (!msg) return; // consumer cancelled

      try {
        const data = JSON.parse(msg.content.toString()) as unknown;
        await handler(data);
        channel.ack(msg);
      } catch (err) {
        console.error(`[RabbitMQBroker] Job failed on queue "${queue}":`, err);
        // Negative-ack without requeue — message goes to dead-letter or is dropped.
        // Change to `true` if you want automatic retry.
        channel.nack(msg, false, false);
      }
    });

    console.log(`[RabbitMQBroker] Consumer registered on queue: ${queue}`);
  }

  /** Declare all exchanges and queues the app needs. */
  async setupTopology(): Promise<void> {
    if (!this.connection) throw new Error('[RabbitMQBroker] Not connected');

    const ch = await this.connection.createChannel();

    // ── Exchanges ────────────────────────────────────────────────────────
    await ch.assertExchange(EXCHANGES.INBOUND, 'direct', { durable: true });
    await ch.assertExchange(EXCHANGES.OUTBOUND, 'direct', { durable: true });
    await ch.assertExchange(EXCHANGES.CAMPAIGN, 'fanout', { durable: true });
    await ch.assertExchange(EXCHANGES.CAMPAIGN_IMPORT, 'direct', { durable: true });
    await ch.assertExchange(EXCHANGES.CAMPAIGN_START, 'direct', { durable: true });
    await ch.assertExchange(EXCHANGES.CAMPAIGN_DISPATCH, 'direct', { durable: true });

    // ── Queues ───────────────────────────────────────────────────────────
    // Inbound: single durable queue — competing consumers process one at a time
    await ch.assertQueue('wa.inbound.q', { durable: true });
    await ch.bindQueue('wa.inbound.q', EXCHANGES.INBOUND, '');

    // Outbound: single durable queue — scale by running multiple instances
    await ch.assertQueue('wa.outbound.q', { durable: true });
    await ch.bindQueue('wa.outbound.q', EXCHANGES.OUTBOUND, '');

    // Campaign Import
    await ch.assertQueue('campaign.import.q', { durable: true });
    await ch.bindQueue('campaign.import.q', EXCHANGES.CAMPAIGN_IMPORT, '');

    // Campaign Start (Scheduling)
    await ch.assertQueue('campaign.start.q', { durable: true });
    await ch.bindQueue('campaign.start.q', EXCHANGES.CAMPAIGN_START, '');

    // Campaign Dispatch
    await ch.assertQueue('campaign.dispatch.q', { durable: true });
    await ch.bindQueue('campaign.dispatch.q', EXCHANGES.CAMPAIGN_DISPATCH, '');

    // Campaign: per-instance exclusive queue bound to fanout exchange.
    // Each running instance gets its own queue → every instance receives
    // every campaign message (broadcast pattern).
    const { queue: campaignQueue } = await ch.assertQueue('', {
      exclusive: true,   // auto-deleted when this connection closes
      durable: false,
    });
    await ch.bindQueue(campaignQueue, EXCHANGES.CAMPAIGN, '');
    this._campaignQueue = campaignQueue; // store for consumer registration

    await ch.close();
    console.log('[RabbitMQBroker] Topology declared');
  }

  get campaignQueue(): string {
    return this._campaignQueue ?? '';
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async createConnection(): Promise<void> {
    this.connection = await amqp.connect(this.url);

    this.connection.on('error', (err: unknown) => {
      console.error('[RabbitMQBroker] Connection error:', err);
    });

    this.connection.on('close', () => {
      if (!this.isShuttingDown) {
        console.warn('[RabbitMQBroker] Connection closed unexpectedly — reconnecting...');
        this.scheduleReconnect();
      }
    });

    this.publishChannel = await this.connection.createChannel();
    this.publishChannel.on('error', (err: unknown) => {
      console.error('[RabbitMQBroker] Publish channel error:', err);
    });

    console.log('[RabbitMQBroker] Connected to RabbitMQ');
    this.reconnectDelay = 2000; // reset backoff on successful connect
  }

  private scheduleReconnect(): void {
    setTimeout(async () => {
      if (this.isShuttingDown) return;
      console.log(`[RabbitMQBroker] Reconnecting in ${this.reconnectDelay}ms...`);
      try {
        await this.createConnection();
        await this.setupTopology();
      } catch (err) {
        console.error('[RabbitMQBroker] Reconnect failed:', err);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // cap at 30s
        this.scheduleReconnect();
      }
    }, this.reconnectDelay);
  }
}
