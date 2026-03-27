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

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy better-sqlite3 native binding (prebuilt .node binary)
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

VOLUME /data

EXPOSE 3000

COPY <<'EOF' /entrypoint.sh
#!/bin/sh
chown -R nextjs:nodejs /data
exec su-exec nextjs node server.js
EOF
RUN apk add --no-cache su-exec && chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
