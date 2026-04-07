# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Stage 3: Production image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data
# Set PUBLIC_URL to the externally reachable URL (e.g. https://books.example.com)
# so OPDS feed links point to the correct host instead of the container's internal address.
# ENV PUBLIC_URL=
# Authentication credentials (required)
# ENV AUTH_USERNAME=
# ENV AUTH_PASSWORD=

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /data/library && \
    chown -R nextjs:nodejs /data

# System libs for node-canvas (Cairo/Pango)
RUN apk add --no-cache cairo pango libjpeg-turbo giflib

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy all node_modules (pnpm symlink structure requires full copy)
COPY --from=builder /app/node_modules ./node_modules

# Copy conversion worker source, shared libs, and dependencies
COPY --from=builder /app/src/worker ./src/worker
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/contexts ./src/contexts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

VOLUME /data

EXPOSE 3000

COPY <<'EOF' /entrypoint.sh
#!/bin/sh
chown -R nextjs:nodejs /data
su-exec nextjs npx tsx src/worker/convert.ts &
exec su-exec nextjs node server.js
EOF
RUN apk add --no-cache su-exec && chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
