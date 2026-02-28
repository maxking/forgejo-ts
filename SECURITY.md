# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security vulnerabilities.

Report vulnerabilities privately to the maintainers with:

- Affected version(s)
- Reproduction steps / proof of concept
- Impact assessment
- Suggested remediation (if available)

## Scope

This project is a TypeScript client library for Forgejo/Gitea APIs. Typical security-relevant areas include:

- Authentication/token handling
- Request construction and endpoint/path encoding
- Error handling and sensitive data exposure in logs
- Dependency vulnerabilities

## Operational guidance

- Never commit real API tokens or credentials.
- Use environment variables for secrets (e.g. `FORGEJO_TEST_TOKEN`).
- Rotate any token immediately if exposure is suspected.
