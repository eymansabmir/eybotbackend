# WhatsApp Flow Builder - Backend (Phase 1)

Clean architecture implementation following the plugin-first paradigm.

## Phase 1 Completed ✓

### Core Foundation
- ✅ TypeScript configuration with strict mode
- ✅ ESLint and Prettier setup
- ✅ Vitest testing framework
- ✅ Core types (Flow, Node, Edge, Session, Contact, Variable)
- ✅ Zod validation schemas for all types
- ✅ Error hierarchy (AppError, ValidationError, etc.)

### Utilities
- ✅ Variable Resolver - Handles `{{session.x}}` interpolation
- ✅ Condition Evaluator - Evaluates recursive AND/OR rule trees
- ✅ Both utilities have comprehensive unit tests

### Plugin SDK
- ✅ Plugin interface contract
- ✅ Execution context and result interfaces
- ✅ Service registry interface
- ✅ Plugin registry with validation
- ✅ Full test coverage for registry

### Initial Plugins
- ✅ **start** - Entry point node
- ✅ **end** - Terminal node
- ✅ **send_text** - Send text message with variable interpolation
- ✅ All plugins tested in isolation

## Project Structure

```
src/
├── core/
│   ├── types/              # All TypeScript interfaces
│   ├── schemas/            # Zod validation schemas
│   ├── errors/             # Error hierarchy
│   ├── variable-resolver/  # {{variable}} interpolation
│   └── condition-evaluator/# AND/OR rule evaluation
├── plugin-sdk/
│   ├── plugin.interface.ts
│   ├── context.interface.ts
│   ├── result.interface.ts
│   ├── service-registry.interface.ts
│   └── registry.ts
├── plugins/
│   ├── flow-control/
│   │   ├── start/
│   │   └── end/
│   └── messaging/
│       └── send-text/
├── app.ts
└── server.ts
```

## Installation

```bash
npm install
```

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build

# Lint
npm run lint

# Format
npm run format
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/plugins` - List all registered plugins

## Testing

All core utilities and plugins have comprehensive test coverage:

```bash
npm test
```

## Architecture Principles

1. **Plugin-First**: Every node type is a self-contained plugin
2. **Clean Architecture**: Clear separation of concerns across layers
3. **Dependency Inversion**: Engine depends on abstractions, not implementations
4. **Open/Closed**: Open for extension (new plugins), closed for modification
5. **Stateless Design**: All state in external stores (MongoDB/Redis)

## Next Steps (Phase 2)

- MongoDB models and repositories
- Flow CRUD API endpoints
- Graph validation service
- Bot execution engine
- WhatsApp layer integration
- BullMQ queue setup

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/flowbuilder
REDIS_URL=redis://localhost:6379
```

## EY Managed Services WhatsApp Assistant

Internal RAG assistant for EY partners over WhatsApp (Interakt). When enabled, unmatched chat messages (no active flow session and no intent/trigger match) fall through to GenAI; intent-matched bots still start the flow engine. WhatsApp Flow survey webhooks still use `WA_FLOW_RESPONSE`.

**Vector store:** PostgreSQL **pgvector** on `DATABASE_URL` (default). Azure AI Search is not required. Qdrant remains optional via `MS_ASSISTANT_VECTOR_STORE=qdrant`.

### Dev setup (pgvector)

1. Postgres 14+ with the `vector` extension (your host DB, or `docker compose --profile pgvector up -d postgres`).
2. Enable the extension once (migration also runs this):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

3. Apply migrations and ingest knowledge (local Xenova = **384-d**, locked to `vector(384)`):

```bash
# Redis (RabbitMQ must already be reachable via RABBITMQ_URL)
docker compose up -d redis

npx prisma migrate deploy
npm run ingest:ms-kb
# optional: npx ts-node -r tsconfig-paths/register scripts/smoke-pgvector-search.ts
npm run dev
```

### .env essentials

```bash
# MANAGED_SERVICES_ASSISTANT_ENABLED=true
# OPENAI_API_KEY=<fine-grained GitHub PAT with Copilot Requests>
# MS_ASSISTANT_LLM_PROVIDER=copilot
# MS_ASSISTANT_EMBED_PROVIDER=local
# MS_ASSISTANT_VECTOR_STORE=pgvector
# MS_ASSISTANT_CHAT_MODEL=gpt-4.1
# REDIS_URL=redis://localhost:6379
# WHATSAPP_PROVIDER=interakt
```

Point Interakt Developer Settings webhook at your existing BSP path (e.g. `BSP_WEBHOOK_PATH`).

**EY workaround:** chat goes through the official `@github/copilot-sdk` (your Copilot subscription + PAT). Embeddings run on-device via `@xenova/transformers` so RAG never calls OpenAI. Vectors live in Postgres (`ms_knowledge_chunks`).

**Docker note:** local embeddings need **glibc** (`onnxruntime-node`). The image uses `node:20-bookworm-slim`. Alpine (`node:*-alpine`) often dies with `Ort::Exception` / “No error information” during model load — rebuild with the current Dockerfile.

### Demo script

1. Send `Hi` → welcome menu (*MS Lens*, *Triggers*, *Guide & Ask*, *Talk to a human*)
2. Type a free-text question anytime, or use *Guide & Ask*
3. Examples: “Do we have SAP offerings?”, “What differentiates our cloud managed services?”

### Layout

```
src/features/ms-assistant/   # greeting, RAG (pgvector), Redis memory, LLM, formatter
knowledge/managed-services/  # seed docs
scripts/ingest-ms-knowledge.ts
```
