export { PluginRegistry } from './plugin-registry';
export type { IPlugin, IPluginRegistry } from './plugin.interface';

// Plugins — export names and interfaces so features can reference them
// without importing concrete implementation classes.
export { DATABASE_PLUGIN } from './database';
export type { IDatabasePlugin } from './database';

export { REDIS_PLUGIN } from './redis';
export type { IRedisPlugin } from './redis';

export { STORAGE_PLUGIN } from './storage';
export type { IStoragePlugin } from './storage';

export { ENGINE_PLUGIN } from './engine';
export type { IEnginePlugin, OrchestratorResult, OutboundMessage } from './engine';

export { WHATSAPP_PLUGIN } from './whatsapp';
export type { IWhatsAppPlugin, IWhatsAppSender } from './whatsapp';

export { AUTH_PLUGIN } from './auth';
export type { IAuthPlugin } from './auth';

export { WORKER_PLUGIN, EXCHANGES, INBOUND_HANDLER, CAMPAIGN_HANDLER } from './worker';
export type { IWorkerPlugin, ExchangeName, IInboundHandler, ICampaignHandler } from './worker';

export { OPENAI_PLUGIN } from './openai';
export type { IOpenAIPlugin } from './openai';

export { ELEVENLABS_PLUGIN } from './elevenlabs';
export type { IElevenLabsPlugin } from './elevenlabs';
