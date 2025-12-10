# packages/@core-v2/Dockerfile
# Multi-stage build for Effect-TS entity extraction service

# Stage 1: Build
FROM oven/bun:1.2.23-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json bun.lock ./
COPY packages/@core-v2/package.json ./packages/@core-v2/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY packages/@core-v2/ ./packages/@core-v2/

# Build TypeScript
WORKDIR /app/packages/@core-v2
RUN bun run build

# Stage 2: Production
FROM oven/bun:1.2.23-alpine

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/@core-v2/dist ./dist
COPY --from=builder /app/packages/@core-v2/package.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S effect -u 1001 -G nodejs

USER effect

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:8080/health/live').then(r => process.exit(r.ok ? 0 : 1))"

# Expose port
EXPOSE 8080

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8080

# Start server
CMD ["bun", "run", "dist/server.js"]
