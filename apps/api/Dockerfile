FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

# Install all dependencies (needed for build)
RUN npm ci

# Copy source
COPY apps/api/src ./apps/api/src
COPY packages/shared/src ./packages/shared/src

# Build
RUN npx turbo run build --filter=@cricket/api

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy built output and production dependencies
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Don't run as root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S cricscore -u 1001 -G nodejs
USER cricscore

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

EXPOSE 3001
CMD ["node", "dist/server.js"]
