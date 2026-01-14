# Security Policy

## Supported Versions

This is a reference implementation intended for educational and development purposes. We recommend always using the latest version.

| Version  | Supported          |
| -------- | ------------------ |
| latest   | :white_check_mark: |
| < latest | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in this project, please report it responsibly.

### How to Report

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Email security concerns to the repository maintainers
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Assessment**: We will assess the vulnerability and determine its severity
- **Resolution**: We aim to address critical vulnerabilities within 7 days
- **Disclosure**: We will coordinate disclosure timing with you

### Scope

This security policy applies to:

- The core application code in this repository
- Configuration examples and templates
- Documentation that could lead to security issues if followed incorrectly

Out of scope:

- Third-party dependencies (report to their maintainers)
- Issues in development/demo credentials (these are intentionally simple)
- Theoretical vulnerabilities without proof of concept

## Security Features

This reference implementation includes several security features:

### Authentication & Authorization

- OpenID Connect with PKCE
- JWT access tokens with proper validation
- Secure token storage in HTTP-only cookies
- Timing-safe password comparison

### Input Validation

- Zod schema validation for all external inputs
- Allow-list approach for API endpoints
- Bounds checking on pagination parameters
- Path parameter sanitization

### Infrastructure Security

- Helmet.js for security headers
- HTTPS required (via Caddy)
- Non-root Docker containers
- Frozen lockfiles for reproducible builds

### CI/CD Security

- Automated dependency updates (Dependabot)
- Security scanning (npm audit, CodeQL, Trivy)
- Branch protection recommendations

## Security Best Practices for Implementers

If you're using this as a reference for your own implementation:

1. **Never use development credentials in production**
   - Generate new secrets: `node scripts/secrets.js all`
   - Store secrets in a proper secret manager

2. **Replace the in-memory user store**
   - Use a proper database
   - Hash passwords with bcrypt or Argon2
   - Implement account lockout after failed attempts

3. **Enable all security features**
   - Configure branch protection
   - Enable Dependabot alerts
   - Set up security scanning workflows

4. **Keep dependencies updated**
   - Review Dependabot PRs promptly
   - Run `pnpm audit` regularly
   - Subscribe to security advisories for key dependencies

5. **Implement additional production controls**
   - Rate limiting
   - Audit logging
   - Intrusion detection
   - Regular security assessments

## Known Limitations

This is a reference implementation with intentional simplifications:

- **In-memory storage**: Sessions and grants don't persist across restarts
- **Demo credentials**: Hardcoded test users for demonstration
- **No rate limiting**: Should be added for production use
- **Simplified error handling**: Production should have more granular error responses

These are documented to help implementers understand what needs to be enhanced for production use.
