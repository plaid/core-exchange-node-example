# Build FDX APIs using Plaid

## Core Exchange Sample Implementation with Node.js

<p align="center">
  <img src="apps/app/public/plaidypus-200.png" alt="Plaidypus Logo" width="200">
</p>

A working example of [Plaid Core Exchange](https://plaid.com/core-exchange/docs/) with OpenID Connect and FDX API v6.3. We built this with TypeScript, Express, and battle-tested OAuth libraries so you can see how all the pieces fit together.

> [!TIP]
> **Try it live!** View the online demo at [app.plaidypus.dev](https://app.plaidypus.dev/)

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

This monorepo contains three apps and some shared utilities:

### Authorization Server (`apps/auth`)

This OpenID Provider lets users log in and grant permissions. `oidc-provider` (via Express) handles authentication, authorization, and tokens. Supports multiple clients, refresh tokens, and JWT access tokens. Uses in-memory storage, with plans for PostgreSQL.

**What it does:** Login and consent UI (with EJS + Tailwind), configurable scopes and claims, forced interaction flows, RP-initiated logout

### Resource Server (`apps/api`)

Implements FDX v6.3 via Plaid Core Exchange. Validates JWT access tokens issued by the Auth server and checks their scopes. Customer and account data use a repository pattern.

**Endpoints you get:** Customer info, account details, statements, transactions, contact info, payment and asset transfer network data

### Client Application (`apps/app`)

The Relying Party app securely accesses protected data using openid-client and PKCE. Includes an API explorer, token debugging tools, and stores tokens in HTTP-only cookies.

**The fun stuff:** API Explorer UI, token inspection, refresh token handling, automatic OIDC discovery that retries until it connects

### Shared Package (`apps/shared`)

Common utilities and TypeScript configs that all three apps use. Managed with pnpm workspaces.

## Getting Started

Follow these steps to get the project running locally:

1. Install prerequisites (Node.js, pnpm, Caddy)
2. Install dependencies
3. Configure environment variables
4. Set up HTTPS with Caddy
5. Start the services

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

### Configure Environment

Each app requires its own `.env` file. Copy the example files for each service as shown:

```bash
# Copy environment files for each app
cp apps/auth/.env.example apps/auth/.env
cp apps/api/.env.example apps/api/.env
cp apps/app/.env.example apps/app/.env
```

Defaults in `.env.example` work out of the box for local dev using localtest.me for URLs; modify as needed.

- **Service URLs**: Uses `*.localtest.me` subdomains (no `/etc/hosts` needed!)
  - Auth: `https://id.localtest.me` (port 3001)
  - API: `https://api.localtest.me` (port 3003)
  - App: `https://app.localtest.me` (port 3004)
- **OAuth Client**: Pre-configured with development credentials (`dev-rp` / `dev-secret`)
- **Secrets**: Development-safe defaults (change for production!)

**For production**, you'll need to generate secure secrets for `apps/auth/.env` and `apps/app/.env`:

```bash
# Generate all production secrets at once
node scripts/secrets.js all

# Or generate them individually:
node scripts/secrets.js client   # OAuth client credentials
node scripts/secrets.js secrets  # Cookie secrets
node scripts/secrets.js jwks     # Token signing keys
```

See the [Configuration](#configuration) section for detailed information about all available options.

## Commands You'll Use

**Note**: Before running these commands, make sure you've completed the setup steps above (environment configuration and Caddy setup).

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

**This step is required before running the apps.** Caddy generates its own internal CA and handles TLS certificates automatically.

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

Node.js doesn't use macOS's system trust store for TLS, so we need to manually point it to Caddy's CA.

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

## Try It Out

Once everything's running, here's the fun part:

1. **Check the discovery endpoint**: Visit <https://id.localtest.me/.well-known/openid-configuration>. You should see JSON configuration data.

2. **Log in**: Head to <https://app.localtest.me> and click **Login**.

3. **Use the demo account**: Email is `user@example.test`, password is `passw0rd!`.

4. **Grant permissions**: You'll see a consent screen asking for:
   - `openid` - Basic identity
   - `profile` - Profile information
   - `email` - Email address
   - `offline_access` - Offline access (gives you refresh tokens)
   - `accounts:read` - Account data

5. **Explore the features**: Once you're logged in, check out:
   - **API Explorer** at `/api-explorer` - Interactive UI to test all the FDX endpoints
   - **Token Inspector** at `/token` - See your ID token claims and user info
   - **Token Debug** at `/debug/tokens` - Inspect the raw and decoded tokens (access, ID, refresh)

## What You Get

### Authorization Server (Auth)

- **Multiple client support** - Configure as many OAuth clients as you need via `apps/auth/.env.clients.json` (see `apps/auth/.env.clients.example.json`)
- **Refresh tokens** - Automatically issued when `offline_access` scope is requested. You can also force-enable them per client with `force_refresh_token: true`
- **Configurable token lifetimes**:
  - Session: 1 day
  - Access Token: 1 hour
  - ID Token: 1 hour
  - Refresh Token: 14 days
  - Grant: 1 year
- **Dynamic consent UI** - Shows all requested scopes with friendly descriptions

### Resource Server (API)

All the FDX v6.3 endpoints you need for Plaid Core Exchange:

- **Customer**: `/api/fdx/v6/customers/current`
- **Accounts**: `/api/fdx/v6/accounts`, `/api/fdx/v6/accounts/{accountId}`
- **Statements**: `/api/fdx/v6/accounts/{accountId}/statements`, `/api/fdx/v6/accounts/{accountId}/statements/{statementId}`
- **Transactions**: `/api/fdx/v6/accounts/{accountId}/transactions`
- **Contact**: `/api/fdx/v6/accounts/{accountId}/contact`
- **Networks**: `/api/fdx/v6/accounts/{accountId}/payment-networks`, `/api/fdx/v6/accounts/{accountId}/asset-transfer-networks`

Every endpoint validates JWT access tokens and enforces the right scopes.

### Client Application (APP)

- **API Explorer** - Interactive UI for testing endpoints with query parameters
- **Token management** - Stores access tokens, refresh tokens, and ID tokens in secure HTTP-only cookies
- **Token debugging** - View raw and decoded JWT tokens at `/debug/tokens`
- **Token inspector** - Display ID token claims at `/token`
- **PKCE** - Uses Proof Key for Code Exchange (because security matters)

## Troubleshooting

**Getting 502 Bad Gateway or TLS errors like `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`?**

Make sure Caddy is running and trusted. Check that the Auth server is reachable at `https://id.localtest.me/.well-known/openid-configuration`. And double-check that `NODE_EXTRA_CA_CERTS` points to Caddy's CA:

```bash
export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"
```

**Changed your ports or hostnames?**

Update the relevant variables in each app's `.env` file:

- `apps/auth/.env`: Update `OP_ISSUER`, `OP_PORT`, `REDIRECT_URI`
- `apps/api/.env`: Update `API_HOST`, `API_PORT`, `OP_ISSUER`
- `apps/app/.env`: Update `APP_HOST`, `APP_PORT`, `OP_ISSUER`, `REDIRECT_URI`, `API_BASE_URL`

Then update your `caddyfile` to match the new routes.

## Configuration

If you haven't already, create `.env` files for each app (see [Configure Environment](#configure-environment) in Getting Started). Here's a detailed breakdown of all configuration options:

**Configuration files:**

- `apps/auth/.env` - Authorization Server (OpenID Provider)
- `apps/api/.env` - Resource Server (API)
- `apps/app/.env` - Client Application (Relying Party)

### Basic Setup

```bash
# Service URLs
OP_ISSUER=https://id.localtest.me
APP_BASE_URL=https://app.localtest.me
API_BASE_URL=https://api.localtest.me

# Ports
OP_PORT=3001
APP_PORT=3004
API_PORT=3003

# Single Client (default setup)
# Use the scripts/secrets.js CLI app to generate new secrets
CLIENT_ID=dev-rp-CHANGE-FOR-PRODUCTION
CLIENT_SECRET=dev-secret-CHANGE-FOR-PRODUCTION
REDIRECT_URI=https://app.localtest.me/callback

# Security (please change these for production!)
# Use the scripts/secrets.js CLI app to generate new secrets
COOKIE_SECRET=dev-cookie-secret-CHANGE-FOR-PRODUCTION
API_AUDIENCE=api://my-api
```

### Generating Secure Secrets

For production deployments, you should generate cryptographically secure secrets instead of using the default development values. We provide a CLI tool that makes this easy:

```bash
# Generate OAuth client credentials (CLIENT_ID and CLIENT_SECRET)
node scripts/secrets.js client

# Generate client credentials with a custom prefix
node scripts/secrets.js client --prefix myapp

# Generate application secrets (COOKIE_SECRET, etc.)
node scripts/secrets.js secrets

# Generate JWKS (JSON Web Key Set) for token signing
node scripts/secrets.js jwks

# Generate everything at once (client, secrets, and JWKS)
node scripts/secrets.js all

# Show help
node scripts/secrets.js --help
```

The tool generates:

- **CLIENT_ID**: URL-safe random string (32 characters, or 24 + prefix)
- **CLIENT_SECRET**: Cryptographically secure hex string (64 characters)
- **COOKIE_SECRET**: Secure hex string (64 characters)
- **JWKS**: RSA key pair (RS256, 2048 bits) formatted as a JSON Web Key Set

**Security best practices:**

- Never commit generated secrets to version control
- Use different secrets for each environment (dev, staging, production)
- Store production secrets in secure environment variables or secret managers (AWS Secrets Manager, HashiCorp Vault, etc.)
- Rotate secrets regularly in production

### Token Signing Keys (JWKS)

#### Development vs Production

**Development (default):**

- If you don't set the `JWKS` environment variable, `oidc-provider` will automatically generate ephemeral (temporary) signing keys on startup
- These keys use the default key ID (`kid`) of `"keystore-CHANGE-ME"`
- Keys are regenerated every time the auth server restarts, invalidating all existing tokens
- This is perfectly fine for local development since tokens have short lifetimes (1 hour)

**Production (required):**

- You **MUST** provide your own JWKS to prevent token invalidation on server restarts
- Generate persistent signing keys with `node scripts/secrets.js jwks`
- Store the JWKS in a secure environment variable or secret manager
- The generated JWKS contains **PRIVATE KEY material** - treat it like any other secret!

#### Why This Matters

When the Authorization Server signs JWT tokens (ID tokens and access tokens), it uses a private key and includes the key ID (`kid`) in the JWT header. The Resource Server (API) uses the public key from the JWKS endpoint to verify token signatures.

**Problems with ephemeral keys in production:**

1. **Service restarts invalidate all tokens** - Users and applications must re-authenticate
2. **Load balancing issues** - Different servers may have different keys
3. **No key rotation strategy** - Can't implement proper cryptographic key rotation
4. **Debugging difficulties** - The generic `kid` value doesn't help identify which key was used

**Benefits of persistent keys:**

1. **Tokens survive restarts** - Access/ID tokens remain valid across deployments
2. **Proper key rotation** - You can add new keys while keeping old ones for validation
3. **Better security** - Control your cryptographic material instead of relying on auto-generated keys
4. **Meaningful key IDs** - Generated keys have unique identifiers like `key-abc123def456`

#### Setting Up JWKS for Production

```bash
# Generate JWKS
node scripts/secrets.js jwks

# Add the output to your .env file or secret manager
JWKS='{"keys":[{"kty":"RSA","n":"...","e":"AQAB","d":"...","kid":"key-abc123","alg":"RS256","use":"sig"}]}'
```

The generated JWKS includes:

- **Public components** (`kty`, `n`, `e`, `kid`, `alg`, `use`) - Exposed at `/.well-known/jwks.json`
- **Private components** (`d`, `p`, `q`, `dp`, `dq`, `qi`) - Used for signing, never exposed

**Important notes:**

- The JWKS is a JSON string, so wrap it in single quotes in your `.env` file
- Never commit this to version control - it contains private key material
- For production, store in AWS Secrets Manager, HashiCorp Vault, or similar
- You can have multiple keys in the `keys` array for key rotation

### Refresh Token Controls

Want refresh tokens even without the `offline_access` scope? Add a per-client flag in `apps/auth/.env.clients.json`:

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

### Multiple Client Setup

Need to support multiple OAuth/OIDC clients? Create a `.env.clients.json` file in the auth app directory:

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

Check out `apps/auth/.env.clients.example.json` for a complete example, then copy it to `apps/auth/.env.clients.json` and customize as needed.

**Client loading priority:**

1. `OIDC_CLIENTS` environment variable (JSON string)
2. `apps/auth/.env.clients.json` file
3. Falls back to single client from `CLIENT_ID`/`CLIENT_SECRET` in `apps/auth/.env`

If you change `OP_ISSUER` or ports, remember to update the client registration (especially redirect URIs) and restart everything.

## Security

This reference implementation includes security best practices that you should carry forward into your own implementations. See [SECURITY.md](SECURITY.md) for our security policy and vulnerability reporting guidelines.

### Security Features

| Feature | Implementation |
| ------- | -------------- |
| **Input Validation** | Zod schemas validate all external inputs with allow-list approach |
| **Security Headers** | Helmet.js sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.) |
| **HTTPS Required** | All services communicate over TLS via Caddy |
| **Secure Cookies** | Tokens stored in HTTP-only, secure, same-site cookies |
| **Password Security** | Timing-safe comparison prevents timing attacks |
| **JWT Validation** | Access tokens validated against JWKS with proper audience/issuer checks |

### Dependency Security

We use automated tools to keep dependencies secure:

- **Dependabot**: Weekly automated PRs for dependency updates
- **npm audit**: Security vulnerability scanning in CI
- **CodeQL**: Static analysis for security issues
- **Trivy**: Container image vulnerability scanning

### What You Should Add for Production

This demo intentionally omits some production requirements:

- **Rate limiting** - Prevent brute force and DoS attacks
- **Audit logging** - Track authentication events and API access
- **Account lockout** - Lock accounts after repeated failed login attempts
- **Password hashing** - Replace demo passwords with bcrypt/Argon2 hashed passwords
- **Persistent storage** - Replace in-memory stores with a database

## Docker and CI/CD

This project includes containerization and CI/CD support for secure, repeatable deployments.

### Docker

Each service has a production-ready Dockerfile with multi-stage builds:

```bash
# Build and run all services
docker compose up --build

# Or build individual images
docker build -f apps/auth/Dockerfile -t core-exchange-auth .
docker build -f apps/api/Dockerfile -t core-exchange-api .
docker build -f apps/app/Dockerfile -t core-exchange-app .
```

**Dockerfile features:**

- Multi-stage builds for minimal image size
- Non-root user for security
- Health checks for orchestration
- Production dependencies only

See `docker-compose.yml` for local development and `docker-compose.prod.example.yml` as a production template.

### GitHub Actions

| Workflow | Purpose |
| -------- | ------- |
| `ci.yml` | Lint, build, and security audit on PRs |
| `security.yml` | Weekly CodeQL and container scanning |
| `deploy-*.yml` | Deploy services to infrastructure |

### Recommended Branch Protection

Configure these settings on your main branch:

- Require pull request reviews before merging
- Require status checks to pass (CI workflow)
- Require branches to be up to date
- Enable Dependabot security alerts

## JWT Access Tokens with Resource Indicators (RFC 8707)

We use **Resource Indicators for OAuth 2.0 (RFC 8707)** to issue **JWT access tokens** instead of opaque tokens. This matters if your API needs to validate tokens locally without a callback to the auth server.

### Why Resource Indicators?

In `oidc-provider` v7+, the old `formats.AccessToken: "jwt"` config was deprecated. Now, if you want JWT access tokens, you need to use Resource Indicators (`resourceIndicators`). It's a bit more work, but it's the right way to do it.

### How It Works

The `accessTokenFormat` property in `getResourceServerInfo()` determines what kind of token you get:

```typescript
resourceIndicators: {
  enabled: true,
  getResourceServerInfo: async (ctx, resourceIndicator, client) => {
    return {
      scope: "openid profile email accounts:read",
      audience: "api://my-api",
      accessTokenFormat: "jwt",  // This is the magic line—JWT instead of opaque
      accessTokenTTL: 3600
    };
  }
}
```

### The Gotcha: Three Places to Add `resource`

Here's the tricky part—you need to include the `resource` parameter in **three different places**:

1. **Authorization Request** (`/login` route):

   ```typescript
   const url = client.buildAuthorizationUrl(config, {
     redirect_uri: REDIRECT_URI,
     scope: "openid email profile offline_access accounts:read",
     resource: "api://my-api"  // Stores resource in the authorization code
   });
   ```

2. **Token Exchange Request** (`/callback` route):

   ```typescript
   const tokenSet = await client.authorizationCodeGrant(
     config,
     currentUrl,
     { pkceCodeVerifier, expectedState },
     { resource: "api://my-api" }  // Triggers JWT token issuance
   );
   ```

3. **Refresh Token Request** (`/refresh` route):

   ```typescript
   const tokenSet = await client.refreshTokenGrant(
     config,
     refreshToken,
     { resource: "api://my-api" }  // Ensures refreshed token is also JWT
   );
   ```

### Why You Need All Three

If you forget to include `resource` in the token exchange (step 2), `oidc-provider` does something unexpected:

- When `openid` scope is present and there's no `resource` parameter in the token request
- It issues an **opaque token** for the UserInfo endpoint instead
- This happens even if you configured `getResourceServerInfo` to return JWT format

It's a quirk in how `oidc-provider` resolves resources (see `lib/helpers/resolve_resource.js` if you're curious). The fix is simple—just include `resource` in all three places.

### How to Check If It's Working

Turn on debug logging to see what kind of tokens you're getting:

```bash
LOG_LEVEL=debug pnpm dev
```

Look for the token response log. JWT tokens look like this:

```json
{
  "accessTokenLength": 719,        // JWT: ~700-900 characters
  "accessTokenParts": 3,           // JWT: 3 parts (header.payload.signature)
  "accessTokenPrefix": "eyJhbGci"  // JWT: Base64 "eyJ" prefix
}
```

If you see opaque tokens (wrong!), they'll be:

- Length: 43 characters
- Parts: 1 (single random string)
- No Base64 prefix

### Resource Indicator Format Rules

Resource indicators need to be absolute URIs. Here's what works and what doesn't:

```typescript
// ✅ Good
"api://my-api"
"https://api.example.com"
"https://api.example.com/v1"

// ❌ Bad
"my-api"                           // Not an absolute URI
"https://api.example.com#section"  // Can't have fragments (#)
```

### Quick Reference

**In the Auth Server** ([apps/auth/src/index.ts](apps/auth/src/index.ts)):

- `resourceIndicators.enabled`: Set to `true`
- `resourceIndicators.defaultResource()`: Fallback resource when client doesn't specify one
- `resourceIndicators.getResourceServerInfo()`: Returns `accessTokenFormat: "jwt"` (this is the important one)
- `resourceIndicators.useGrantedResource()`: Allows reusing the resource from the auth request

**In the Client** ([apps/app/src/index.ts](apps/app/src/index.ts)):

- Authorization URL: Add `resource` parameter
- Token exchange: Add `resource` in the 4th parameter
- Refresh token: Add `resource` in the 3rd parameter

## Debugging OAuth Flows

Want to see what's happening under the hood? Add this to your `.env`:

```bash
LOG_LEVEL=debug
```

You'll get detailed logs about:

- **Authorization requests** - client_id, redirect_uri, scopes, response_type, state, resource
- **Login attempts** - email provided, success/failure
- **Consent flow** - grants created/reused, scopes granted, claims requested, resource indicators
- **Token issuance** - refresh token decisions, resource server info, token format (JWT vs opaque)
- **Account lookups** - subject lookups and claim retrieval

We use Pino for structured JSON logging. Here's what a log entry looks like:

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

**Helpful log filters:**

```bash
# Watch for debug and error messages
pnpm dev | grep -i "debug\|error"

# Filter by specific OAuth events
pnpm dev | grep "interaction\|login\|consent\|issueRefreshToken\|getResourceServerInfo"
```

## What's Next

This is a demo implementation with in-memory storage. If you're taking this to production, you'll want to add:

- **Persistent storage** - Swap in a PostgreSQL adapter for `oidc-provider` so authorization codes, sessions, and grants survive restarts
- **Real user authentication** - Replace the in-memory user store with a proper database and password hashing (bcrypt or Argon2)
- **End-to-end tests** - Add Playwright or Cypress tests to verify the complete authentication flow
- **Production hardening** - Rate limiting, audit logging, and monitoring instrumentation
- **Dynamic client registration** - Let clients register themselves via an API endpoint instead of manual config files
