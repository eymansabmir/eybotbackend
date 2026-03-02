# multi-stage build so dev dependencies never reach the runtime image
FROM node:20-alpine AS builder
WORKDIR /app

# install dependencies (npm ci fails under npm@10 workspaces)
COPY package*.json ./
RUN npm install

# build TypeScript -> dist
COPY . .
RUN npm run build

# production runtime image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# install only production deps
COPY package*.json ./
RUN npm install --omit=dev

# copy compiled output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
