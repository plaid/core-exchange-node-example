# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Commands

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

```bash
# Run all services in development mode with hot reload
# Note: This command includes NODE_EXTRA_CA_CERTS for Caddy's internal CA
pnpm dev

# Run individual services
pnpm dev:op    # Authorization Server (OP)
pnpm dev:api   # Resource Server (API)
pnpm dev:app   # Client App (Relying Party)

# Build all applications
pnpm build

# Production commands (after build)
pnpm --filter @apps/op start    # Start OP in production
pnpm --filter @apps/api start   # Start API in production  
pnpm --filter @apps/app start   # Start APP in production
```

### Caddy Configuration

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

### 1. Authorization Server (OP - OpenID Provider)

- Located in `apps/op`
- Built with `oidc-provider` embedded in Express
- Handles authentication, authorization, and token issuance
- Includes built-in interaction flows (login/consent) for simplicity
- Currently uses in-memory storage (Postgres adapter planned)
- Default test user: `user@example.test` / `passw0rd!`

Key components:

- OIDC configuration (clients, claims, scopes)
- Basic interaction handlers (login and consent flows)
- In-memory user store (temporary)

### 2. Resource Server (API)

- Located in `apps/api`
- Protects resources with JWT validation using `jose`
- Validates tokens against the OP's JWKS endpoint
- Enforces scope-based authorization (e.g., `accounts:read`)

Key components:

- JWT verification middleware
- Protected resources requiring specific scopes
- Public health endpoint

### 3. Client Application (APP)

- Located in `apps/app`
- Acts as a Relying Party using `openid-client`
- Implements Authorization Code flow with PKCE
- Stores tokens in HTTP-only cookies
- Makes authenticated calls to the API

Key components:

- OIDC client setup and discovery
- Login/callback handling with PKCE
- Token storage in secure cookies
- API calls with access token

### Infrastructure

- All services communicate via HTTPS using Caddy's internal CA
- Caddy handles routing via `*.localtest.me` subdomains
- Default endpoints:
  - OP: `https://id.localtest.me`
  - API: `https://api.localtest.me`
  - APP: `https://app.localtest.me`
- Environment variables in `.env` control service configuration

## Testing the Flow

1. Visit `https://id.localtest.me/.well-known/openid-configuration` to verify the OP is running
2. Go to `https://app.localtest.me` and click "Login"
3. Use demo credentials: `user@example.test` / `passw0rd!`
4. Approve consent → redirected to the app
5. Click "Call API" to test the protected resource access

## Next Steps

The repository has identified the following future improvements:

- Implement a Postgres adapter for `oidc-provider` for persistent storage
- Replace the in-memory user store with a DB table + proper password hashing
- Add E2E tests (Playwright/Cypress) to verify the authentication flow
