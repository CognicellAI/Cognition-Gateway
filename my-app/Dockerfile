# syntax=docker/dockerfile:1

# ── Stage 1: deps ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Install pnpm and node-gyp globally
RUN npm install -g pnpm node-gyp

# Copy lockfile and manifest
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev, needed for build)
RUN pnpm install --frozen-lockfile

# Compile better-sqlite3 native binary for the current platform/arch
RUN cd node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3 && \
    node-gyp rebuild

# ── Stage 2: builder ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN npm install -g pnpm

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm db:generate

# Build the Next.js app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm build

# ── Stage 3: runner ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN npm install -g pnpm

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src

# Data directory for SQLite — mounted as a volume in production
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV DATABASE_URL="file:/data/gateway.db"

# On startup: push schema (creates tables if missing), then start
CMD ["sh", "-c", "node_modules/.bin/prisma db push && node_modules/.bin/tsx server.ts"]
