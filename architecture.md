# Backend Architecture - WhatsApp Flow Builder

## Overview
The backend is a high-performance, event-driven Node.js application designed to power a complex WhatsApp Flow Builder. It follows a **Plugin-First Architecture**, where every node type in a flow is a self-contained unit of logic.

## Tech Stack
- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Framework**: Express 5 (Beta)
- **Database**: MongoDB (via Mongoose)
- **Caching & Locking**: Redis
- **Background Jobs**: BullMQ
- **Validation**: Zod & AJV (for JSON Schema)
- **Testing**: Vitest

## Core Architectural Modules

### 1. Bot Engine (The Brain)
The Engine is stateless and responsible for walking the flow graph.
- **Execution Loop**: Processes nodes one by one.
- **Variable Resolver**: Handles `{{variable}}` interpolation across session, contact, and system scopes.
- **Condition Evaluator**: Recursive logic for evaluating complex branching rules.
- **Step Guards**: Protects against infinite loops (max steps and max consecutive logic steps).

### 2. Plugin System
Every node in the flow (e.g., `send_text`, `condition`, `webhook`) is a plugin.
- **Schema-Driven**: Each plugin defines its own configuration schema using JSON Schema.
- **Self-Registering**: Plugins register themselves with a central registry.
- **Isolated Logic**: The engine calls a plugin's `execute` method without knowing its internal implementation.

### 3. WhatsApp Layer (I/O)
Handles the communication with Meta's WhatsApp Cloud API.
- **Webhook Normalizer**: Converts complex Meta payloads into a standard internal `InboundMessage` format.
- **Deduplicator**: Uses Redis to ensure no message is processed twice (idempotency).
- **Adapters**: Supports multiple providers (Cloud API, Twilio) via an adapter pattern.

### 4. Queue Architecture
Uses BullMQ to decouple heavy processing from the API surface.
- **Inbound Queue**: Buffers incoming messages for the Bot Engine.
- **Outbound Queue**: Buffers outgoing messages to handle rate limits and retries effectively.

## Directory Structure
```text
src/
├── api/             # REST API for Flow management and Webhooks
│   ├── controllers/
│   ├── routes/
│   └── middleware/
├── engine/          # Core Bot Engine
│   ├── node-handlers/ # Implementation of each node type
│   ├── execution-loop.ts
│   └── variable-resolver.ts
├── whatsapp/        # Webhook processing and WA API service
├── schemas/         # Zod schemas (Single source of truth)
├── models/          # Mongoose/MongoDB models
├── repositories/    # Data access layer
├── services/        # Orchestration logic
├── container.ts     # Dependency injection setup
└── server.ts        # Entry point
```

## Key Design Patterns
- **Plugin Pattern**: Enables easy extension with new integrations.
- **Repository Pattern**: Abstracts data source details from business logic.
- **Adapter Pattern**: Decouples the system from specific WhatsApp providers.
- **Distributed Locking**: Uses Redis to prevent race conditions on the same user session.
