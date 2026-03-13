# Message Flow & Dependency Injection

## 1. How a WhatsApp Message Is Sent

All outbound messages — whether triggered by a single session flow or a mass campaign — pass through one central point: `WhatsAppPlugin.sender`. Nothing else in the codebase calls the Meta API directly.

---

### 1.1 Session Flow (Single Message)

A user sends a WhatsApp message. The app processes it, runs the matching flow, and sends back responses.

```
Meta Webhook POST
      │
      ▼
WhatsAppWebhook Controller          (feature layer)
  ├─ whatsappPlugin.normalizer.normalize()     → parse payload
  ├─ whatsappPlugin.deduplicator.isDuplicate() → skip if seen
  └─ workerPlugin.publish(EXCHANGES.INBOUND, job)  → enqueue
      │
      ▼
RabbitMQ  wa.inbound.q
      │
      ▼
InboundConsumer                     (worker plugin)
  ├─ Acquire Redis lock on (waBusinessNumber + waId)
  ├─ Load contact from DB (create if new)
  ├─ Check for active session
  ├─ Call EnginePlugin.orchestrator.startFlow() or .resumeFlow()
  │     └─ Pure computation → returns { result, contactMutations }
  ├─ Persist session state to DB
  ├─ Persist contact mutations to DB
  ├─ Release Redis lock
  └─ workerPlugin.publish(EXCHANGES.OUTBOUND, outboundJob)  per message
      │
      ▼
RabbitMQ  wa.outbound.q
      │
      ▼
OutboundConsumer                    (worker plugin)
  └─ whatsappPlugin.sender.sendMessages()
        └─ DirectWhatsAppSender → Meta Cloud API HTTP call
```

Key properties:
- The webhook controller returns `200` immediately — the user sees no latency.
- The inbound consumer holds a Redis distributed lock on `(waBusinessNumber:waId)` for the duration of processing, preventing race conditions when messages arrive fast.
- The engine is stateless — it receives entities, returns a result. No DB calls inside it.
- The actual HTTP call to Meta only ever happens inside `WhatsAppPlugin.sender`.

---

### 1.2 Direct API Flow (No Queue)

Some callers (e.g. the session HTTP endpoint `/api/chat-sessions`) send messages synchronously without going through the queue:

```
POST /api/chat-sessions
      │
      ▼
SessionController                   (feature layer)
  ├─ contactService.getOrCreateContactByWaId()
  ├─ sessionService.startFlow()
  │     ├─ Load flow + contact
  │     ├─ EnginePlugin.orchestrator.startFlow()
  │     ├─ Persist session
  │     └─ Return { outboundMessages, session }
  └─ whatsappPlugin.sender.sendMessages()   ← still goes through WhatsAppPlugin
        └─ DirectWhatsAppSender → Meta Cloud API
```

The rule holds: `whatsappPlugin.sender` is always the single exit point for outbound messages, whether called from a worker consumer or directly from a controller.

---

### 1.3 Campaign (Broadcast to Many)

A campaign sends one message template to a list of recipients. The fanout exchange ensures every running worker instance participates.

```
POST /api/campaigns                 (future feature)
      │
      ▼
CampaignController
  └─ workerPlugin.publish(EXCHANGES.CAMPAIGN, campaignJob)
      │
      ▼
RabbitMQ  campaign exchange  (fanout)
      │
      ├──────────────────────────────────────────┐
      ▼                                          ▼
campaign.q.<uuid-instance-1>        campaign.q.<uuid-instance-2>
      │                                          │
      ▼                                          ▼
CampaignConsumer (instance 1)       CampaignConsumer (instance 2)
  └─ whatsappPlugin.sender              └─ whatsappPlugin.sender
        (sends to its recipients)              (sends to its recipients)
```

The campaign job includes a `recipients` array. When you need to scale, partition the recipients list at publish time (split by instance count) so each instance handles a distinct slice. The fanout exchange is what enables broadcast — each instance has its own exclusive queue bound to it at startup, so every instance receives every publish.

**Why fanout for campaigns?**
- Campaigns are not user-session events — they are broadcast instructions.
- You want every available worker to help send them, not compete over the same queue.
- The Meta API rate limit per phone number is the actual bottleneck, handled inside `DirectWhatsAppSender` with per-message awaiting.

---

## 2. Dependency Injection Model

### 2.1 The Registry as the IoC Container

`PluginRegistry` is the single source of truth. It is created in `server.ts` before anything else starts, and passed into every plugin's `initialize()` method and into `createApp()`.

```
server.ts
  ├─ new PluginRegistry()
  ├─ registry.register(new DatabasePlugin())
  ├─ registry.register(new RedisPlugin())
  ├─ registry.register(new StoragePlugin())
  ├─ registry.register(new EnginePlugin())
  ├─ registry.register(new WhatsAppPlugin())
  ├─ registry.register(new WorkerPlugin())
  ├─ await registry.initializeAll()            ← sequential, in order above
  └─ createApp(registry)
```

Each plugin receives the registry in `initialize(registry)` and calls `registry.get<IFoo>('foo')` to resolve its own dependencies. Because `initializeAll()` is sequential and plugins are registered in dependency order, by the time any plugin initializes, all plugins it depends on are already initialized and ready.

```typescript
// Example: WorkerPlugin resolves its deps inside initialize()
async initialize(registry: IPluginRegistry): Promise<void> {
  // These are already initialized because they were registered first
  const whatsapp = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
  const engine   = registry.get<IEnginePlugin>(ENGINE_PLUGIN);
  const db       = registry.get<IDatabasePlugin>(DATABASE_PLUGIN);
}
```

### 2.2 The Current Coupling Problem

Right now, `WorkerPlugin`'s inbound consumer directly instantiates feature repository classes:

```typescript
// inbound.consumer.ts — THIS IS A VIOLATION
import { PrismaFlowRepository } from '../../../features/flow/flow.repository';

const flowRepo = new PrismaFlowRepository(dbPlugin.prisma);
```

This means the WorkerPlugin has a hard compile-time dependency on the features folder. Plugins should never know about features. This breaks the architecture rule: **plugins are infrastructure, features are domain**.

### 2.3 The Fix: Features Register Their Handlers

The correct model is **inversion of control** — features register themselves into the registry, and the WorkerPlugin's consumers look up interfaces from the registry without knowing the concrete class.

**Step 1 — Define handler interfaces in the worker plugin (not in features)**

```typescript
// plugins/worker/handlers.interface.ts

export const INBOUND_HANDLER = 'inbound.handler' as const;
export const CAMPAIGN_HANDLER = 'campaign.handler' as const;

export interface IInboundHandler {
  process(job: InboundJob): Promise<OutboundJob[]>;
}

export interface ICampaignHandler {
  process(job: CampaignJob): Promise<void>;
}
```

**Step 2 — The session feature implements and registers IInboundHandler**

```typescript
// features/session/session.inbound-handler.ts

export class SessionInboundHandler implements IInboundHandler {
  constructor(
    private readonly sessionService: ISessionService,
    private readonly contactService: IContactService,
  ) {}

  async process(job: InboundJob): Promise<OutboundJob[]> {
    // All domain logic lives here, in the feature layer
    const contact = await this.contactService.getOrCreate(job.orgId, job.waId);
    const result  = await this.sessionService.handleInbound(job, contact);
    return result.outboundMessages.map(msg => toOutboundJob(msg, job));
  }
}

// Registered at app startup in server.ts or via a feature bootstrap function:
registry.register(INBOUND_HANDLER, new SessionInboundHandler(sessionService, contactService));
```

**Step 3 — The inbound consumer becomes a thin dispatcher**

```typescript
// plugins/worker/consumers/inbound.consumer.ts

export async function handleInboundJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const handler = registry.get<IInboundHandler>(INBOUND_HANDLER);
  const outboundJobs = await handler.process(data as InboundJob);

  const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  for (const job of outboundJobs) {
    await workerPlugin.publish(EXCHANGES.OUTBOUND, job);
  }
}
```

Now the WorkerPlugin has zero knowledge of features. It only knows about job shapes and plugin interfaces.

### 2.4 Dependency Flow (Clean)

```
                 registry
                    │
      ┌─────────────┼──────────────────┐
      ▼             ▼                  ▼
  Plugins        Plugins            Features
  (infra)        (transport)        (domain)
                    │                  │
  DatabasePlugin    │            SessionFeature
  RedisPlugin       │              implements
  EnginePlugin      │            IInboundHandler
  WhatsAppPlugin    │                  │
      │             │                  │ registers
      │        WorkerPlugin ◄──────────┘
      │          consumer asks registry.get(INBOUND_HANDLER)
      │          → gets SessionInboundHandler
      │          → calls handler.process(job)
      │          → publishes OutboundJob to EXCHANGES.OUTBOUND
      │
      └──── WhatsAppPlugin.sender.sendMessages()
                → Meta API
```

### 2.5 Summary of Rules

| Rule | Reason |
|------|--------|
| Plugins never import from `features/` | Prevents circular coupling; plugins are infrastructure |
| Features import plugin interfaces (not classes) from `plugins/index.ts` | Features depend on abstractions, not implementations |
| Features register handler interfaces into the registry | Inverts control — plugins call features without knowing about them |
| All outbound Meta API calls go through `whatsappPlugin.sender` | Central point for rate limiting, logging, stub swapping in tests |
| Workers only know about job shapes and handler interfaces | Workers are dumb dispatchers; business logic lives in features |

### 2.6 Bootstrap Order in server.ts

```
Phase 1  — No deps
  DatabasePlugin
  RedisPlugin
  StoragePlugin
  EnginePlugin

Phase 2  — Needs Redis
  WhatsAppPlugin

Phase 3  — Needs Redis + WhatsApp + Engine + Database
  WorkerPlugin      ← starts consumers, but consumers resolve handlers lazily from registry

Phase 4  — Register feature handlers (after feature services are instantiated)
  registry.register(INBOUND_HANDLER, new SessionInboundHandler(...))
  registry.register(CAMPAIGN_HANDLER, new CampaignHandler(...))

Phase 5
  createApp(registry)   ← mount routes
  server.listen()
```

Consumers resolve handlers at job-processing time (lazy registry lookup), not at startup. This means WorkerPlugin can initialize before feature handlers are registered, as long as no jobs arrive before Phase 4 completes — which is safe because the server is not yet accepting requests.
