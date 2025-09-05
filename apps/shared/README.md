# @apps/shared

Shared security utilities for the OAuth educational project monorepo.

## Overview

This package provides common security utilities used across all applications in the OAuth monorepo, including error handling, logging, and authentication utilities.

## Installation

This package is automatically available to other apps in the monorepo via workspace dependencies:

```json
{
  "dependencies": {
    "@apps/shared": "workspace:*"
  }
}
```

## Usage

### Import all utilities from main module
```typescript
import { sanitizeError, logError, AuthenticationError } from "@apps/shared";
```

### Import specific utilities from security module
```typescript
import { sanitizeError, logError } from "@apps/shared/security";
```

## API Reference

### Error Sanitization

#### `sanitizeError(error: unknown, defaultMessage?: string): ErrorResponse`

Sanitizes error messages for production to prevent information leakage:

- **Development**: Shows detailed error messages
- **Production**: Shows only safe error types or generic messages

```typescript
try {
  // Some operation
} catch (error) {
  const sanitized = sanitizeError(error, "Operation failed");
  res.status(500).json(sanitized);
}
```

#### `logError(logger: any, error: unknown, context?: Record<string, unknown>)`

Securely logs errors with contextual information:

```typescript
logError(logger, error, { 
  context: "OAuth callback",
  userId: "user123" 
});
```

### Custom Error Classes

- `ValidationError` - For input validation errors (400)
- `AuthenticationError` - For authentication failures (401)  
- `AuthorizationError` - For authorization failures (403)
- `NotFoundError` - For resource not found errors (404)

```typescript
throw new AuthenticationError("Invalid access token");
```

## Security Features

- **Environment-aware error messages**: Detailed in development, generic in production
- **Safe error type filtering**: Only whitelisted error types shown in production
- **Secure logging**: Prevents sensitive data from appearing in logs
- **HTTP status code mapping**: Automatic mapping from error types to status codes

## Development

```bash
# Build the shared module
pnpm build

# Watch mode for development
pnpm dev

# Clean build artifacts
pnpm clean
```

## Dependencies

- **Peer Dependencies**: `pino` (logging)
- **Dev Dependencies**: `typescript`, `@types/node`

## License

MIT