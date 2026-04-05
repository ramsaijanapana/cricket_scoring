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

# SPA fallback: serve index.html for all non-file routes
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
\n\
  location ~* \\.(?:css|js|svg|png|jpg|jpeg|gif|ico|woff2?)$ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
