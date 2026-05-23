# Build Stage
FROM node:20-alpine AS builder

# Install system dependencies (needed for prisma)
RUN apk add --no-cache libc6-compat

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
FROM node:20-alpine AS runner

WORKDIR /app
RUN chown node:node /app

USER node

ENV NODE_ENV=production

# Re-install only production dependencies
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma/
COPY --chown=node:node prisma.config.ts ./
RUN npm install --omit=dev && npm cache clean --force

# Copy build output and prisma client
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 4000

CMD ["node", "dist/server.js"]
