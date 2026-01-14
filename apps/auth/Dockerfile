# Authorization Server (OpenID Provider) Dockerfile
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
COPY apps/auth/package.json ./apps/auth/
COPY apps/shared/package.json ./apps/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/shared ./apps/shared
COPY apps/auth ./apps/auth
COPY tsconfig.base.json ./

# Build shared library first, then auth
RUN pnpm --filter @apps/shared build
RUN pnpm --filter @apps/auth build

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
COPY apps/auth/package.json ./apps/auth/
COPY apps/shared/package.json ./apps/shared/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
COPY --from=builder /app/apps/shared/dist ./apps/shared/dist
COPY --from=builder /app/apps/auth/dist ./apps/auth/dist
COPY --from=builder /app/apps/auth/public ./apps/auth/public
COPY --from=builder /app/apps/auth/views ./apps/auth/views

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Set environment defaults
ENV NODE_ENV=production
ENV OP_PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/.well-known/openid-configuration || exit 1

# Start the application
CMD ["node", "apps/auth/dist/index.js"]
