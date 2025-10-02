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

Key features:

- **Multiple client support**: Configure multiple OIDC clients via `.env.clients.json` or `OIDC_CLIENTS` environment variable
- **Refresh token support**: Issues refresh tokens when `offline_access` scope is requested and client supports `refresh_token` grant type
- **Configurable TTLs**: Session (1 day), Grant (1 year), AccessToken (1 hour), IdToken (1 hour), RefreshToken (14 days)
- **Dynamic scope display**: Consent screen shows requested scopes with human-readable descriptions
- **Forced interactions**: Authorization flow uses `prompt: "login consent"` to always show login and consent screens
- **RP-initiated logout**: Supports logout with automatic form submission

### 2. Resource Server (API)

- Located in `apps/api`
- Protects resources with JWT validation using `jose`
- Validates tokens against the Auth server's JWKS endpoint
- Enforces scope-based authorization (e.g., `accounts:read`)
- Includes customer and account data repositories
- Uses Pino for structured logging
- Runs on port 3003
- Implements FDX Core Exchange API specification (v6.3.1)

Key components:

- JWT verification middleware
- Protected resources requiring specific scopes
- Customer and account data models
- Repository pattern for data access
- Request validation utilities
- Public health endpoint

Available endpoints (FDX Core Exchange compliant):

- `/api/cx/customers/current` - Get current customer information
- `/api/cx/accounts` - List customer accounts
- `/api/cx/accounts/{accountId}` - Get account details
- `/api/cx/accounts/{accountId}/contact` - Get account contact information
- `/api/cx/accounts/{accountId}/statements` - List account statements
- `/api/cx/accounts/{accountId}/statements/{statementId}` - Download statement PDF
- `/api/cx/accounts/{accountId}/transactions` - Get account transactions
- `/api/cx/accounts/{accountId}/payment-networks` - Get payment network information
- `/api/cx/accounts/{accountId}/asset-transfer-networks` - Get asset transfer network information

### 3. Client Application (APP)

- Located in `apps/app`
- Acts as a Relying Party using `openid-client`
- Implements Authorization Code flow with PKCE
- Stores tokens in HTTP-only cookies (access token, refresh token, ID token)
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

Features:

- **API Explorer**: Interactive UI for testing all FDX Core Exchange endpoints with parameter inputs
- **Profile page**: View decoded ID token claims and user information at `/me`
- **Token debug endpoint**: View raw and decoded tokens at `/debug/tokens`
- **Quick API test**: Simple accounts endpoint test at `/accounts`
- **Offline access**: Requests `offline_access` scope to receive refresh tokens
- **Comprehensive scopes**: Requests `openid`, `email`, `profile`, `offline_access`, and `accounts:read` scopes

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

## Configuration

### Client Configuration

The authorization server supports multiple client configurations:

1. **Single client** (default): Set `CLIENT_ID`, `CLIENT_SECRET`, and `REDIRECT_URI` in `.env`
2. **Multiple clients**: Create `.env.clients.json` file in the project root (see `.env.clients.example.json`)
3. **Environment variable**: Set `OIDC_CLIENTS` as a JSON string

Each client configuration must include:
- `client_id`: Unique client identifier
- `client_secret`: Client secret for authentication
- `redirect_uris`: Array of allowed redirect URIs
- `post_logout_redirect_uris`: Array of allowed logout redirect URIs
- `grant_types`: Array including `authorization_code` and optionally `refresh_token`
- `response_types`: Array with `code`
- `token_endpoint_auth_method`: Usually `client_secret_basic`

### Scopes

Supported scopes:
- `openid` - Basic identity (required)
- `profile` - Profile information (name)
- `email` - Email address
- `offline_access` - Offline access (enables refresh tokens)
- `accounts:read` - Read access to account data

### Token TTLs

Default token lifetimes (configured in `apps/auth/src/index.ts`):
- Session: 1 day (86400 seconds)
- Grant: 1 year (31536000 seconds)
- Access Token: 1 hour (3600 seconds)
- ID Token: 1 hour (3600 seconds)
- Refresh Token: 14 days (1209600 seconds)

## Testing the Flow

1. Visit `https://id.localtest.me/.well-known/openid-configuration` to verify the Auth server is running
2. Go to `https://app.localtest.me` and click "Login"
3. Use demo credentials: `user@example.test` / `passw0rd!`
4. Approve consent (you'll see all requested scopes: openid, email, profile, offline_access, accounts:read)
5. After redirect, explore the features:
   - **API Explorer** (`/api-explorer`): Test all FDX Core Exchange endpoints interactively
   - **Profile** (`/me`): View your ID token claims and user information
   - **Token Debug** (`/debug/tokens`): Inspect raw and decoded access/ID/refresh tokens
   - **Quick API Test** (`/accounts`): Simple test of the accounts endpoint

## Next Steps

The repository has identified the following future improvements:

- Implement a Postgres adapter for `oidc-provider` for persistent storage
- Replace the in-memory user store with a DB table + proper password hashing
- Add E2E tests (Playwright/Cypress) to verify the authentication flow
