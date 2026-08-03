# Build Stage — Debian (glibc) required for onnxruntime-node / @xenova/transformers
FROM node:20-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Copy source and build
COPY src ./src
COPY tsconfig.json ./
COPY vitest.config.ts ./
RUN npx prisma generate
RUN npm run build

# Production Stage
FROM node:20-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown node:node /app

USER node

ENV NODE_ENV=production
# Xenova / onnxruntime-web: avoid multi-thread WASM issues in Node
ENV OMP_NUM_THREADS=1

# Re-install only production dependencies
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma/
COPY --chown=node:node prisma.config.ts ./
RUN npm install --omit=dev && npm cache clean --force

# Copy build output, prisma client, and prisma CLI from builder
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --chown=node:node --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Knowledge markdown for optional reindex-bundled / local docs in image
COPY --chown=node:node knowledge ./knowledge

# Run migrations on startup, then start the app
COPY --chown=node:node docker-entrypoint.sh ./
USER root
RUN chmod +x docker-entrypoint.sh
USER node

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
