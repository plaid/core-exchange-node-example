# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Commands

**IMPORTANT: This project requires Node.js >=22.0.0. Always use Node 22 for all commands:**

```bash
# Use Node 22 (required for this project)
unset npm_config_prefix && source ~/.nvm/nvm.sh && nvm use 22
```

### Setup

```bash
# Install dependencies
pnpm install

# Setup HTTPS with Caddy
sudo caddy trust         # Install Caddy's internal CA root to macOS trust store
sudo caddy run --config ./caddyfile  # Run Caddy in another terminal window
# OR use the pnpm script:
pnpm caddy
```

### Development

**Note: All development commands require Node 22. Run `unset npm_config_prefix && source ~/.nvm/nvm.sh && nvm use 22` first.**

```bash
# Run all services in development mode with hot reload
# Note: This command includes NODE_EXTRA_CA_CERTS for Caddy's internal CA
pnpm dev

# Run individual services
pnpm dev:auth  # Authorization Server
pnpm dev:api   # Resource Server (API)
pnpm dev:app   # Client App (Relying Party)

# Build all applications
pnpm build

# Lint code
pnpm lint
pnpm lint:fix  # Auto-fix linting issues

# Production commands (after build)
pnpm --filter @apps/auth start  # Start Auth Server in production
pnpm --filter @apps/api start   # Start API in production  
pnpm --filter @apps/app start   # Start APP in production
```

### Caddy Configuration

The current `caddyfile` configuration routes traffic as follows:
- `id.localtest.me` → `localhost:3001` (OP)
- `app.localtest.me` → `localhost:3004` (Client App)
- `api.localtest.me` → `localhost:3003` (Resource Server)

If you prefer not to use sudo, you can modify the `caddyfile` to use high ports:

```
:8443 {
  tls internal
  reverse_proxy localhost:3001
}
```

Then update the `.env` file to reflect the new URL pattern (e.g., `https://localhost:8443`).

## Architecture Overview

This is an OpenID Connect (OIDC) implementation using Express for all services in a pnpm monorepo. The system consists of three main services:

### 1. Authorization Server (Auth - OpenID Provider)

- Located in `apps/auth`
- Built with `oidc-provider` embedded in Express
- Handles authentication, authorization, and token issuance
- Uses EJS templates for interaction views (login/consent)
- Includes Tailwind CSS for styling
- Currently uses in-memory storage (Postgres adapter planned)
- Default test user: `user@example.test` / `passw0rd!`
- Runs on port 3001

Key components:

- OIDC configuration (clients, claims, scopes)
- Basic interaction handlers (login and consent flows)
- In-memory user store (temporary)
- Tailwind CSS build process

### 2. Resource Server (API)

- Located in `apps/api`
- Protects resources with JWT validation using `jose`
- Validates tokens against the Auth server's JWKS endpoint
- Enforces scope-based authorization (e.g., `accounts:read`)
- Includes customer and account data repositories
- Uses Pino for structured logging
- Runs on port 3003

Key components:

- JWT verification middleware
- Protected resources requiring specific scopes
- Customer and account data models
- Repository pattern for data access
- Request validation utilities
- Public health endpoint

### 3. Client Application (APP)

- Located in `apps/app`
- Acts as a Relying Party using `openid-client`
- Implements Authorization Code flow with PKCE
- Stores tokens in HTTP-only cookies
- Makes authenticated calls to the API
- Uses EJS templates for views
- Includes Tailwind CSS for styling
- Runs on port 3004

Key components:

- OIDC client setup and discovery
- Login/callback handling with PKCE
- Token storage in secure cookies
- API calls with access token
- EJS view templates
- Tailwind CSS build process

### Infrastructure

- All services communicate via HTTPS using Caddy's internal CA
- Caddy handles routing via `*.localtest.me` subdomains
- Default endpoints:
  - Auth: `https://id.localtest.me` (port 3001)
  - API: `https://api.localtest.me` (port 3003)
  - APP: `https://app.localtest.me` (port 3004)
- Environment variables in `.env` control service configuration
- TypeScript with ESM modules across all apps
- Shared TypeScript configuration via `tsconfig.base.json`
- ESLint configuration with TypeScript and Stylistic plugins
- Pino structured logging throughout

## Testing the Flow

1. Visit `https://id.localtest.me/.well-known/openid-configuration` to verify the Auth server is running
2. Go to `https://app.localtest.me` and click "Login"
3. Use demo credentials: `user@example.test` / `passw0rd!`
4. Approve consent → redirected to the app
5. Click "Call API" to test the protected resource access

## Next Steps

The repository has identified the following future improvements:

- Implement a Postgres adapter for `oidc-provider` for persistent storage
- Replace the in-memory user store with a DB table + proper password hashing
- Add E2E tests (Playwright/Cypress) to verify the authentication flow
