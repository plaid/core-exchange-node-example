# Core Exchange Sample Implementation

<p align="center">
  <img src="apps/app/public/plaidypus-200.png" alt="Plaidypus Logo" width="200">
</p>

A working example of [Plaid Core Exchange](https://plaid.com/core-exchange/docs/) with OpenID Connect and FDX Core Exchange API v6.3. We built this with TypeScript, Express, and battle-tested OAuth libraries so you can see how all the pieces fit together.

## What's Inside

**The Core Stuff:**

- **TypeScript** (v5.9) with ESM modules everywhere
- **Node.js** (v22+) - Yes, you need the latest
- **pnpm** (v10) - For managing our monorepo workspace

**OAuth/OIDC (the important bits):**

- **oidc-provider** (v9) - Standards-compliant OpenID Provider
- **openid-client** (v6) - Certified Relying Party client
- **jose** (v6) - JWT validation and JWKS handling

**Infrastructure:**

- **Express** (v5) - Our HTTP server framework
- **Caddy** - Reverse proxy that handles HTTPS with zero config
- **Pino** - Fast, structured JSON logging
- **Helmet** - Security headers on by default

**Frontend:**

- **EJS** - Server-side templates (keeping it simple)
- **Tailwind CSS** (v4) - Utility-first styling
- **tsx** - TypeScript execution with hot reload

**Development:**

- **concurrently** - Runs multiple services at once
- **ESLint** - Keeps our code consistent

## How It's Organized

This monorepo has three main apps and some shared utilities:

### Authorization Server (`apps/auth`)

The OpenID Provider. This is where users log in and grant permissions. We're using `oidc-provider` (embedded in Express) to handle the OAuth dance—authentication, authorization, and token issuance. It supports multiple clients, refresh tokens with configurable lifetimes, and resource indicators (RFC 8707) for JWT access tokens. Right now it uses in-memory storage, but we have our eye on a PostgreSQL adapter.

**What it does:** Login and consent UI (with EJS + Tailwind), configurable scopes and claims, forced interaction flows, RP-initiated logout

### Resource Server (`apps/api`)

The protected API implementing FDX Core Exchange API v6.3. Every request gets validated—we check JWT access tokens using `jose` against the Auth server's JWKS endpoint and enforce scope-based authorization. Customer and account data live here, accessed via a repository pattern.

**Endpoints you get:** Customer info, account details, statements, transactions, contact info, payment and asset transfer network data

### Client Application (`apps/app`)

The Relying Party—basically, the app that needs to access protected data. Built with `openid-client` (a certified library), it shows you how to do Authorization Code flow with PKCE properly. We built an interactive API explorer so you can poke around, plus tools for debugging tokens and viewing profile data. Tokens are stored in HTTP-only cookies for security.

**The fun stuff:** API Explorer UI, token inspection, refresh token handling, automatic OIDC discovery that retries until it connects

### Shared Package (`apps/shared`)

Common utilities and TypeScript configs that all three apps use. Managed with pnpm workspaces.

## Getting Started

### What You Need (macOS)

```bash
brew install node pnpm caddy
```

**Version requirements:**

- Node.js ≥22.0.0 (we enforce this in `package.json`)
- pnpm ≥10.15.1
- Caddy (latest is fine)

### Installation

```bash
pnpm install
```

This installs dependencies for all workspace packages. We're using pnpm workspaces with an `apps/*` pattern—it's a nice way to manage a monorepo.

## Commands You'll Use

### Development Mode

```bash
pnpm dev              # Run all three services with hot reload
pnpm dev:auth         # Just the Authorization Server
pnpm dev:api          # Just the Resource Server
pnpm dev:app          # Just the Client Application
```

### Production Mode

```bash
pnpm build            # Build everything (TypeScript + CSS)
pnpm --filter @apps/auth start   # Start Auth server
pnpm --filter @apps/api start    # Start API server
pnpm --filter @apps/app start    # Start Client app
```

### Other Helpful Commands

```bash
pnpm lint             # Check code style
pnpm lint:fix         # Fix what can be auto-fixed
pnpm caddy            # Start the reverse proxy (needs sudo)
```

### Setting Up HTTPS with Caddy

Caddy generates its own internal CA and handles TLS certificates automatically. Pretty neat.

#### Option A: Bind to port 443 (recommended)

```bash
# From the repo root
sudo caddy run --config ./caddyfile

# In another terminal, trust Caddy's CA
sudo caddy trust
```

This gives you nice URLs:

- `https://id.localtest.me` (Auth server)
- `https://app.localtest.me` (Client app)
- `https://api.localtest.me` (API server)

If your browser still complains about certificates, restart it or check your Keychain for the Caddy root CA.

#### Option B: No sudo? Use a high port

Edit the `caddyfile` and add a port to each site:

```caddyfile
:8443 {
  tls internal
  reverse_proxy localhost:3001
}
```

Then update your `.env` to use `https://localhost:8443` for the issuer and redirect URIs. Port 443 is easier, but this works if you can't use sudo.

### Running the Apps

Node.js doesn't use the macOS system trust store for TLS, so we need to point it to Caddy's CA manually.

```bash
# The easy way—this sets NODE_EXTRA_CA_CERTS for you
pnpm dev

# Running apps individually? Set this in your terminal first:
export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"
```

**A few notes:**

- You can actually start the Node apps before Caddy is ready. The client app will retry OIDC discovery until `https://id.localtest.me` responds. (You'll see some retry logs, but it'll eventually connect.)
- That said, starting Caddy first is faster and less noisy.
- If you switch terminals, remember to set `NODE_EXTRA_CA_CERTS` again—or just use `pnpm dev` which handles it for you.

## Quick Start

1. Visit **<https://id.localtest.me/.well-known/openid-configuration>** – discovery JSON should load.
2. Go to **<https://app.localtest.me>** and click **Login**.
3. Use demo creds on the Auth interactions page: `user@example.test` / `passw0rd!`.
4. Review and approve the consent screen showing requested permissions:
   - `openid` - Basic identity
   - `profile` - Profile information
   - `email` - Email address
   - `offline_access` - Offline access (refresh tokens)
   - `accounts:read` - Account data
5. After login, explore the client app features:
   - **API Explorer** (`/api-explorer`) - Interactively test all FDX Core Exchange endpoints
   - **Profile** (`/me`) - View your ID token claims and user info
   - **Token Debug** (`/debug/tokens`) - Inspect raw and decoded tokens (access, ID, refresh)
   - **Quick API Test** (`/accounts`) - Simple endpoint test

## Features

### Authorization Server (Auth)

- **Multiple client support**: Configure clients via `.env.clients.json` file (see `.env.clients.example.json` for format)
- **Refresh token support**: Automatically issued when `offline_access` scope is requested; can be force-enabled per client via `force_refresh_token: true` in `.env.clients.json`
- **Configurable token TTLs**:
  - Session: 1 day
  - Access Token: 1 hour
  - ID Token: 1 hour
  - Refresh Token: 14 days
  - Grant: 1 year
- **Dynamic consent UI**: Shows all requested scopes with descriptions
- **RP-initiated logout**: Supports standard logout flow

### Resource Server (API)

Implements FDX Core Exchange API v6.3 with the following endpoints:

- **Customer**: `/api/fdx/v6/customers/current`
- **Accounts**: `/api/fdx/v6/accounts`, `/api/fdx/v6/accounts/{accountId}`
- **Statements**: `/api/fdx/v6/accounts/{accountId}/statements`, `/api/fdx/v6/accounts/{accountId}/statements/{statementId}`
- **Transactions**: `/api/fdx/v6/accounts/{accountId}/transactions`
- **Contact**: `/api/fdx/v6/accounts/{accountId}/contact`
- **Networks**: `/api/fdx/v6/accounts/{accountId}/payment-networks`, `/api/fdx/v6/accounts/{accountId}/asset-transfer-networks`

All endpoints require valid JWT access tokens with appropriate scopes.

### Client Application (APP)

- **API Explorer**: Interactive UI for testing all endpoints with query parameters
- **Token management**: Stores access tokens, refresh tokens, and ID tokens in secure HTTP-only cookies
- **Token debugging**: View raw and decoded JWT tokens at `/debug/tokens`
- **Profile viewer**: Display ID token claims at `/me`
- **PKCE**: Uses Proof Key for Code Exchange for enhanced security

## Troubleshooting

- 502 Bad Gateway or TLS errors (e.g. `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`) during discovery: Ensure Caddy is running and trusted, verify the Auth server via `https://id.localtest.me/.well-known/openid-configuration`, and confirm `NODE_EXTRA_CA_CERTS` points to Caddy's CA:

  ```bash
  export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"
  ```

- If you changed ports/hosts, make sure `OP_ISSUER`, `APP_BASE_URL`, `API_BASE_URL`, and `REDIRECT_URI` match the Caddy routes you are serving.

## Configuration

Copy `.env.example` to `.env` and customize as needed. Key settings:

### Basic Configuration

```bash
# Service URLs
OP_ISSUER=https://id.localtest.me
APP_BASE_URL=https://app.localtest.me
API_BASE_URL=https://api.localtest.me

# Ports
OP_PORT=3001
APP_PORT=3004
API_PORT=3003

# Single Client (default)
CLIENT_ID=dev-rp
CLIENT_SECRET=dev-secret-CHANGE-FOR-PRODUCTION
REDIRECT_URI=https://app.localtest.me/callback

# Security
COOKIE_SECRET=dev-cookie-secret-CHANGE-FOR-PRODUCTION
API_AUDIENCE=api://my-api
```

### Refresh Token Controls

- Per-client flag in `.env.clients.json` to always issue refresh tokens, even if `offline_access` was not requested:

  ```json
  [
    {
      "client_id": "dev-rp",
      "client_secret": "dev-secret",
      "redirect_uris": ["https://app.localtest.me/callback"],
      "post_logout_redirect_uris": ["https://app.localtest.me"],
      "grant_types": ["authorization_code", "refresh_token"],
      "response_types": ["code"],
      "token_endpoint_auth_method": "client_secret_basic",
      "force_refresh_token": true
    }
  ]
  ```

### Multiple Client Configuration

To register multiple OAuth/OIDC clients, create a `.env.clients.json` file in the project root:

```json
[
  {
    "client_id": "app1",
    "client_secret": "secret1",
    "redirect_uris": ["https://app1.example.com/callback"],
    "post_logout_redirect_uris": ["https://app1.example.com"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "client_secret_basic"
  }
]
```

See `.env.clients.example.json` for a complete example with multiple clients.

The authorization server loads clients in this priority order:

1. `OIDC_CLIENTS` environment variable (JSON string)
2. `.env.clients.json` file
3. Fall back to single client from `CLIENT_ID`/`CLIENT_SECRET`

If you change `OP_ISSUER` or ports, also update the client registration (redirect URI) and restart.

## JWT Access Tokens with Resource Indicators (RFC 8707)

This implementation uses **Resource Indicators for OAuth 2.0 (RFC 8707)** to issue **JWT access tokens** instead of opaque tokens. This is critical for APIs that need to validate tokens locally using JWT verification.

### Why Resource Indicators?

In `oidc-provider` v7+, the `formats.AccessToken: "jwt"` configuration was **deprecated**. To issue JWT access tokens, you **must** use the Resource Indicators feature (`resourceIndicators`).

### How It Works

The access token format is determined by the `accessTokenFormat` property returned from `getResourceServerInfo()`:

```typescript
resourceIndicators: {
  enabled: true,
  getResourceServerInfo: async (ctx, resourceIndicator, client) => {
    return {
      scope: "openid profile email accounts:read",
      audience: "api://my-api",
      accessTokenFormat: "jwt",  // CRITICAL: This makes tokens JWT instead of opaque
      accessTokenTTL: 3600
    };
  }
}
```

### Critical Implementation Details

**The `resource` parameter MUST be sent in THREE places:**

1. **Authorization Request** (`/login` route):

   ```typescript
   const url = client.buildAuthorizationUrl(config, {
     redirect_uri: REDIRECT_URI,
     scope: "openid email profile offline_access accounts:read",
     resource: "api://my-api"  // <-- Stores resource in authorization code
   });
   ```

2. **Token Exchange Request** (`/callback` route):

   ```typescript
   const tokenSet = await client.authorizationCodeGrant(
     config,
     currentUrl,
     { pkceCodeVerifier, expectedState },
     { resource: "api://my-api" }  // <-- Triggers JWT token issuance
   );
   ```

3. **Refresh Token Request** (`/refresh` route):

   ```typescript
   const tokenSet = await client.refreshTokenGrant(
     config,
     refreshToken,
     { resource: "api://my-api" }  // <-- Ensures refreshed token is also JWT
   );
   ```

### Why All Three Are Required

**Without `resource` in token exchange**, `oidc-provider` has special behavior:

- If `openid` scope is present AND no `resource` parameter is in the token request
- oidc-provider issues an **opaque token** for the UserInfo endpoint
- This happens **even if** you configured `getResourceServerInfo` to return JWT format

From `oidc-provider` source code (`lib/helpers/resolve_resource.js`):

```javascript
// If openid scope exists and no resource parameter in token request,
// oidc-provider defaults to opaque token for UserInfo endpoint
case !ctx.oidc.params.resource && (!config.userinfo.enabled || !scopes.has('openid')):
  resource = model.resource;
  break;
```

### Verifying JWT Tokens

You can verify the token format in debug logs:

```bash
LOG_LEVEL=debug pnpm dev
```

Look for the token response log:

```json
{
  "accessTokenLength": 719,        // JWT: ~700-900 chars
  "accessTokenParts": 3,           // JWT: 3 parts (header.payload.signature)
  "accessTokenPrefix": "eyJhbGci"  // JWT: Base64 "eyJ" prefix
}
```

**Opaque tokens** (incorrect):

- Length: 43 characters
- Parts: 1 (single random string)
- No Base64 prefix

### Resource Indicator Format

Resource indicators must be:

- Absolute URIs (e.g., `https://api.example.com` or `api://my-api`)
- **Without** fragment components (`#`)
- Can include path components

Examples:

```typescript
// ✅ Valid
"api://my-api"
"https://api.example.com"
"https://api.example.com/v1"

// ❌ Invalid
"my-api"                           // Not absolute URI
"https://api.example.com#section"  // Contains fragment
```

### Configuration Reference

**Auth Server** (`apps/auth/src/index.ts`):

- `resourceIndicators.enabled`: Must be `true`
- `resourceIndicators.defaultResource()`: Default resource when client doesn't specify
- `resourceIndicators.getResourceServerInfo()`: **Critical** - returns `accessTokenFormat: "jwt"`
- `resourceIndicators.useGrantedResource()`: Allows reusing resource from auth request

**Client** (`apps/app/src/index.ts`):

- Authorization URL: Include `resource` parameter
- Token exchange: Include `resource` in 4th parameter
- Refresh token: Include `resource` in 3rd parameter

## Debugging OAuth Flows

To enable detailed debug logging of the OAuth/OIDC flow, add this to your `.env` file:

```bash
LOG_LEVEL=debug
```

With debug logging enabled, you'll see detailed information about:

- **Authorization requests**: client_id, redirect_uri, scopes, response_type, state, resource
- **Login attempts**: email provided, authentication success/failure
- **Consent flow**: grants created/reused, scopes granted, claims requested, resource indicators
- **Token issuance**: refresh token decisions, resource server info, token format (JWT vs opaque)
- **Account lookups**: subject lookups and claim retrieval

Debug logs are output in JSON format via Pino. Example log entry:

```json
{
  "level": 20,
  "time": 1234567890,
  "name": "op",
  "uid": "abc123",
  "clientId": "dev-rp",
  "requestedScopes": ["openid", "email", "profile", "offline_access"],
  "msg": "GET /interaction/:uid - Interaction details loaded"
}
```

To watch logs in real-time during development:

```bash
pnpm dev | grep -i "debug\|error"
```

Or filter by specific OAuth events:

```bash
pnpm dev | grep "interaction\|login\|consent\|issueRefreshToken\|getResourceServerInfo"
```

## Roadmap

This implementation uses in-memory storage for demonstration purposes. Production deployments should consider:

- **Persistent storage**: Implement PostgreSQL adapter for `oidc-provider` to persist authorization codes, sessions, and grants across restarts
- **User authentication**: Replace in-memory user store with database-backed authentication using bcrypt or Argon2 password hashing
- **End-to-end testing**: Add automated E2E tests using Playwright or Cypress to verify complete authentication flows
- **Production hardening**: Add rate limiting, audit logging, and monitoring instrumentation
- **Client registration API**: Dynamic client registration endpoint for self-service OAuth client onboarding
