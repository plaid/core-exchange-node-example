# Heroku Deployment Setup

Prerequisites for deploying the three services (`plaidypus-auth`, `plaidypus-api`, `plaidypus-app`) via the GitHub Actions workflow.

## 1. Create Heroku Apps

```bash
# If you're using a personal account, use these commands
heroku create plaidypus-auth --stack container
heroku create plaidypus-api --stack container
heroku create plaidypus-app --stack container

# If you're using a team account, add the --team argument
heroku create plaidypus-auth --stack container --team <your-team-name>
heroku create plaidypus-api --stack container --team <your-team-name>
heroku create plaidypus-app --stack container --team <your-team-name>
```

These commands will generate unique URLs for the services, such as `https://plaidypus-auth-xxxxx.herokuapp.com` where the `xxxxx` is a unique key.

If the apps already exist but aren't on the container stack:

```bash
heroku stack:set container --app plaidypus-auth
heroku stack:set container --app plaidypus-api
heroku stack:set container --app plaidypus-app
```

## 2. Generate Production Secrets

```bash
node scripts/secrets.js all
```

Save the output — you'll use the generated values in the next step.

## 3. Set Config Vars

`CLIENT_ID` and `CLIENT_SECRET` must match between plaidypus-auth and plaidypus-app.

### plaidypus-auth

```bash
heroku config:set --app plaidypus-auth \
  OP_ISSUER=https://plaidypus-auth-xxxxx.herokuapp.com \
  API_AUDIENCE=api://my-api \
  CLIENT_ID=<generated> \
  CLIENT_SECRET=<generated> \
  REDIRECT_URI=https://plaidypus-app-xxxxx.herokuapp.com/callback \
  POST_LOGOUT_REDIRECT_URI=https://plaidypus-app-xxxxx.herokuapp.com \
  JWKS='<generated>' \
  LOG_LEVEL=info
```

### plaidypus-api

```bash
heroku config:set --app plaidypus-api \
  OP_ISSUER=https://plaidypus-auth-xxxxx.herokuapp.com \
  API_AUDIENCE=api://my-api \
  LOG_LEVEL=info
```

### plaidypus-app

```bash
heroku config:set --app plaidypus-app \
  OP_ISSUER=https://plaidypus-auth-xxxxx.herokuapp.com \
  APP_HOST=https://plaidypus-app-xxxxx.herokuapp.com \
  APP_BASE_URL=https://plaidypus-app-xxxxx.herokuapp.com \
  API_BASE_URL=https://plaidypus-api-xxxxx.herokuapp.com \
  REDIRECT_URI=https://plaidypus-app-xxxxx.herokuapp.com/callback \
  API_AUDIENCE=api://my-api \
  CLIENT_ID=<generated, must match plaidypus-auth> \
  CLIENT_SECRET=<generated, must match plaidypus-auth> \
  COOKIE_SECRET=<generated> \
  LOG_LEVEL=info
```

## 4. Get Your Heroku API Key

```bash
# Short-lived token (1 month)
heroku auth:token

# Long-lived token (1 year)
heroku authorizations:create

# Token: <your-heroku-api-token>
```

## 5. Add GitHub Repository Secret

```bash
gh secret set HEROKU_API_KEY --repo plaid/core-exchange-node-example
```

Paste the token from step 4 when prompted.

## 6. Deploy

### Manual deploy (before workflow is on main)

Run from the repo root:

```bash
heroku container:login

# Auth
docker buildx build --platform linux/amd64 --provenance=false -f apps/auth/Dockerfile -t registry.heroku.com/plaidypus-auth/web --load .
docker push registry.heroku.com/plaidypus-auth/web
heroku container:release web --app plaidypus-auth

# API
docker buildx build --platform linux/amd64 --provenance=false -f apps/api/Dockerfile -t registry.heroku.com/plaidypus-api/web --load .
docker push registry.heroku.com/plaidypus-api/web
heroku container:release web --app plaidypus-api

# App
docker buildx build --platform linux/amd64 --provenance=false -f apps/app/Dockerfile -t registry.heroku.com/plaidypus-app/web --load .
docker push registry.heroku.com/plaidypus-app/web
heroku container:release web --app plaidypus-app
```

### GitHub Actions (after workflow is merged to main)

Deploys automatically on every push to `main`. Can also be triggered manually:

```bash
gh workflow run "Deploy to Heroku"
```

Or use the "Run workflow" button on the Actions tab in GitHub.

## 7. Verify

```bash
# Check logs
heroku logs --tail --app plaidypus-auth
heroku logs --tail --app plaidypus-api
heroku logs --tail --app plaidypus-app

# Verify endpoints
curl https://plaidypus-auth-xxxxx.herokuapp.com/.well-known/openid-configuration
curl https://plaidypus-api-xxxxx.herokuapp.com/public/health
curl -I https://plaidypus-app-xxxxx.herokuapp.com
```

Test the full OIDC flow by visiting `https://plaidypus-app-xxxxx.herokuapp.com` and logging in with the demo credentials (`user@example.test` / `passw0rd!`).
