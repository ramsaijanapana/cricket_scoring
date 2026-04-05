FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy source
COPY apps/api/src ./apps/api/src
COPY packages/shared/src ./packages/shared/src

# Build
RUN npx turbo run build --filter=@cricket/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

EXPOSE 3001
CMD ["node", "dist/server.js"]
