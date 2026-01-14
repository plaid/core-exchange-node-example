# Resource Server (API) Dockerfile
# Multi-stage build for optimal image size and security

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace configuration
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy app and shared package files
COPY apps/api/package.json ./apps/api/
COPY apps/shared/package.json ./apps/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/shared ./apps/shared
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

# Build shared library first, then api
RUN pnpm --filter @apps/shared build
RUN pnpm --filter @apps/api build

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:22-alpine AS production

# Install pnpm for deploy command
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/shared/package.json ./apps/shared/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
COPY --from=builder /app/apps/shared/dist ./apps/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3003

# Set environment defaults
ENV NODE_ENV=production
ENV API_PORT=3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1

# Start the application
CMD ["node", "apps/api/dist/index.js"]
