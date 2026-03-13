export const WORKER_PLUGIN = 'worker' as const;

/** Exchange names — the only things external code needs to know. */
export const EXCHANGES = {
  INBOUND: 'wa.inbound',
  OUTBOUND: 'wa.outbound',
  CAMPAIGN: 'campaign',
} as const;

export type ExchangeName = (typeof EXCHANGES)[keyof typeof EXCHANGES];

/**
 * WorkerPlugin is the job execution layer.
 *
 * Responsibilities:
 *  - Own the RabbitMQ connection and channel lifecycle
 *  - Declare all exchange/queue topology at startup
 *  - Provide a publish() API for other parts of the app to enqueue jobs
 *  - Register and run all consumers (inbound, outbound, campaign)
 *
 * Each consumer can run as a competing consumer — spin up multiple app
 * instances to scale throughput for any queue independently.
 *
 * Campaign exchange is fanout: every bound instance queue receives the
 * same message, enabling broadcast to all running campaign workers.
 */
export interface IWorkerPlugin {
  publish(exchange: ExchangeName, data: unknown, routingKey?: string): Promise<void>;
}
