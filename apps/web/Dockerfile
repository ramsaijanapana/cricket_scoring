FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/
COPY apps/web/vite.config.ts apps/web/postcss.config.js apps/web/tailwind.config.js ./apps/web/
COPY apps/web/index.html ./apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/ui/package.json packages/ui/tsconfig.json ./packages/ui/

# Install all dependencies (needed for build)
RUN npm ci

# Copy source
COPY apps/web/src ./apps/web/src
COPY packages/shared/src ./packages/shared/src
COPY packages/ui/src ./packages/ui/src

# Build
RUN npx turbo run build --filter=@cricket/web

# ── Production image ─────────────────────────────────────────────────────────
FROM nginx:alpine

# Copy built static assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# API upstream hostname (docker-compose service name by default)
ENV API_HOST=api
ENV NGINX_ENVSUBST_FILTER=API_HOST

COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
