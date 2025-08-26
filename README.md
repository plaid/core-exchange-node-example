# OIDC + Express Monorepo

Pure Node.js OIDC stack using **Express**, **oidc-provider**, **openid-client**, and **jose**. Local HTTPS is provided by **Caddy** using its **internal CA**.

## Services

- **OP** (`apps/op`) – Authorization Server + minimal login/consent (interactions) using `oidc-provider` within Express.
- **API** (`apps/api`) – Protected resource server validating JWTs with `jose` against the OP's JWKS.
- **APP** (`apps/app`) – Relying Party (client) using `openid-client` (Authorization Code + PKCE).

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

**Option A (recommended): bind 443 and trust Caddy CA**

```bash
# From repo root
sudo caddy run --config ./caddyfile
# Run in a separate terminal
sudo caddy trust         # installs Caddy's internal CA root into the macOS trust store
```

- Sites: `https://id.localtest.me`, `https://app.localtest.me`, `https://api.localtest.me` (all proxied to localhost ports).
- If your browser still warns about certs, reopen it or check the Keychain for the Caddy root.

**Option B (no sudo): use a high port like 8443**
Edit the `caddyfile` to add a listener port to each site, e.g.:

```
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

- The client app retries OIDC issuer discovery on startup. You can start the Node apps before Caddy/OP; the app will log retries until `https://id.localtest.me` is reachable.
- Still recommended: start Caddy first for faster startup and fewer retries.
- If you renamed the project folder or switched terminals, ensure `NODE_EXTRA_CA_CERTS` is set in your current shell or use the root `pnpm dev` which sets it automatically.

## Test the flow

1. Visit **https://id.localtest.me/.well-known/openid-configuration** – discovery JSON should load.
2. Go to **https://app.localtest.me** and click **Login**.
3. Use demo creds on the OP interactions page: `user@example.test` / `passw0rd!`.
4. Approve consent → redirected to the app. Click **/accounts** to call the API with the access token.

## Troubleshooting

- 502 Bad Gateway or TLS errors (e.g. `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`) during discovery: Ensure Caddy is running and trusted, verify the OP via `https://id.localtest.me/.well-known/openid-configuration`, and confirm `NODE_EXTRA_CA_CERTS` points to Caddy's CA:

  ```bash
  export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/Caddy/pki/authorities/local/root.crt"
  ```

- If you changed ports/hosts, make sure `OP_ISSUER`, `APP_BASE_URL`, `API_BASE_URL`, and `REDIRECT_URI` match the Caddy routes you are serving.

## Configuration

`.env` carries the defaults:

```
OP_ISSUER=https://id.localtest.me
APP_BASE_URL=https://app.localtest.me
API_BASE_URL=https://api.localtest.me
OP_PORT=3001
APP_PORT=3004
API_PORT=3003
CLIENT_ID=dev-rp
CLIENT_SECRET=dev-secret
REDIRECT_URI=https://app.localtest.me/callback
API_AUDIENCE=api://my-api
```

If you change `OP_ISSUER` or ports, also update the client registration (redirect URI) and restart.

## Next steps

- Implement a **Postgres Adapter** for `oidc-provider` so codes/sessions/grants persist.
- Replace the in-memory user with a DB table + bcrypt/argon2.
- Add a small E2E test (Playwright/Cypress) to drive login → consent → API call.
