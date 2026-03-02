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
