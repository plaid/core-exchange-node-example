# OIDC + Express Monorepo

Pure Node.js OIDC stack using **Express**, **oidc-provider**, **openid-client**, and **jose**. Local HTTPS is provided by **Caddy** using its **internal CA**.

## Services

- **Auth** (`apps/auth`) – Authorization Server (OpenID Provider) using `oidc-provider` within Express. Supports multiple client configurations, refresh tokens, and configurable TTLs.
- **API** (`apps/api`) – Protected resource server implementing FDX Core Exchange API v6.3.1. Validates JWTs with `jose` against the Auth server's JWKS.
- **APP** (`apps/app`) – Relying Party (client) using `openid-client` (Authorization Code + PKCE). Features an API Explorer, token debugging, and profile viewer.

## Prereqs (macOS)

```bash
brew install node pnpm caddy
```

## Setup

```bash
pnpm install
```

### Run Caddy (HTTPS reverse proxy)

Caddy will generate and use its **internal CA**. It can also install that root CA into your system trust store.

#### Option A (recommended): bind 443 and trust Caddy CA

```bash
# From repo root
sudo caddy run --config ./caddyfile
# Run in a separate terminal
sudo caddy trust         # installs Caddy's internal CA root into the macOS trust store
```

- Sites: `https://id.localtest.me`, `https://app.localtest.me`, `https://api.localtest.me` (all proxied to localhost ports).
- If your browser still warns about certs, reopen it or check the Keychain for the Caddy root.

#### Option B (no sudo): use a high port like 8443

Edit the `caddyfile` to add a listener port to each site, e.g.:

```sh
:8443 {
  tls internal
  reverse_proxy localhost:3001
}
```

Then use `https://localhost:8443` (and update `.env` issuer/redirects accordingly). Sticking to port 443 avoids changing issuer/redirect URIs.

### Run the Node apps (in another terminal)

Node does not use the macOS system trust store for TLS. We point Node to Caddy's internal CA so HTTPS calls to `*.localtest.me` validate correctly.

```bash
# Root dev command automatically sets NODE_EXTRA_CA_CERTS for macOS
pnpm dev

# If you run apps individually, set this once per terminal session:
export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"
```

Notes:

- The client app retries OIDC issuer discovery on startup. You can start the Node apps before Caddy/Auth; the app will log retries until `https://id.localtest.me` is reachable.
- Still recommended: start Caddy first for faster startup and fewer retries.
- If you renamed the project folder or switched terminals, ensure `NODE_EXTRA_CA_CERTS` is set in your current shell or use the root `pnpm dev` which sets it automatically.

## Test the flow

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
- **Refresh tokens**: Automatically issued when `offline_access` scope is requested
- **Refresh tokens**: Automatically issued when `offline_access` is requested; can be force-enabled per client via per-client `force_refresh_token: true` in `.env.clients.json`
- **Configurable token TTLs**:
  - Session: 1 day
  - Access Token: 1 hour
  - ID Token: 1 hour
  - Refresh Token: 14 days
  - Grant: 1 year
- **Dynamic consent UI**: Shows all requested scopes with descriptions
- **RP-initiated logout**: Supports standard logout flow

### Resource Server (API)

Implements FDX Core Exchange API v6.3.1 with the following endpoints:

- **Customer**: `/api/cx/customers/current`
- **Accounts**: `/api/cx/accounts`, `/api/cx/accounts/{accountId}`
- **Statements**: `/api/cx/accounts/{accountId}/statements`, `/api/cx/accounts/{accountId}/statements/{statementId}`
- **Transactions**: `/api/cx/accounts/{accountId}/transactions`
- **Contact**: `/api/cx/accounts/{accountId}/contact`
- **Networks**: `/api/cx/accounts/{accountId}/payment-networks`, `/api/cx/accounts/{accountId}/asset-transfer-networks`

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

## Next steps

- Implement a **Postgres Adapter** for `oidc-provider` so codes/sessions/grants persist.
- Replace the in-memory user with a DB table + bcrypt/argon2.
- Add a small E2E test (Playwright/Cypress) to drive login → consent → API call.
