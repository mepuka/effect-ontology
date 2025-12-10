# packages/@core-v2/Dockerfile
# Multi-stage build for Effect-TS entity extraction service

# Stage 1: Build
FROM oven/bun:1.2.23-debian AS builder

WORKDIR /app

# Copy workspace files
COPY package.json bun.lock ./
COPY packages/@core-v2/package.json ./packages/@core-v2/

# Install dependencies
RUN bun install

# Copy source
COPY packages/@core-v2/ ./packages/@core-v2/

# Copy ontologies
COPY ontologies/ ./ontologies/

# Build TypeScript
WORKDIR /app/packages/@core-v2
RUN bun run build

# Stage 2: Production
FROM oven/bun:1.2.23-debian

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/@core-v2/dist/src ./dist
COPY --from=builder /app/packages/@core-v2/package.json ./

# Copy ontologies directory
COPY --from=builder /app/ontologies ./ontologies

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs effect

# Create writable directories for non-root user
RUN mkdir -p /app/output/cache /app/output/runs && \
    chown -R effect:nodejs /app/output

USER effect

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:8080/health/live').then(r => process.exit(r.ok ? 0 : 1))"

# Expose port
EXPOSE 8080

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8080
ENV ONTOLOGY_PATH=/app/ontologies/football/ontology_skos.ttl

# Start server
CMD ["bun", "run", "dist/server.js"]
