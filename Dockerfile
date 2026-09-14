# Build Stage — Node 22+ (Copilot CLI needs Promise.withResolvers); Debian/glibc for onnxruntime-node
FROM node:22-bookworm-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Bundled npm 10.9.x has an arborist bug ("Cannot read properties of null
# (reading 'edgesOut')") that crashes on `overrides` during a fresh install.
# Upgrade to npm 11 which resolves it.
RUN npm install -g npm@11

WORKDIR /app

# Puppeteer's Chromium isn't needed in the build stage (no PDF rendering here),
# so skip the ~150MB download to speed up the build.
ENV PUPPETEER_SKIP_DOWNLOAD=true

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
FROM node:22-bookworm-slim AS runner

# openssl/ca-certificates for the app; chromium + fonts for Puppeteer resume PDFs.
# Installing the distro `chromium` pulls in all required shared libraries and
# avoids Puppeteer's bundled-Chrome download (and version drift).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    chromium \
    fonts-liberation fonts-noto-core fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

# Match the builder's npm to avoid the arborist `edgesOut` crash on overrides.
RUN npm install -g npm@11

WORKDIR /app
RUN chown node:node /app

USER node

ENV NODE_ENV=production
# Xenova / onnxruntime-web: avoid multi-thread WASM issues in Node
ENV OMP_NUM_THREADS=1
# Use the distro Chromium instead of Puppeteer's bundled download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

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

# Run migrations (always) and optional MS KB ingest (RUN_MS_KB_INGEST=true) on startup
COPY --chown=node:node docker-entrypoint.sh ./
USER root
RUN chmod +x docker-entrypoint.sh
USER node

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
