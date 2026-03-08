# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Preclinical, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email security@preclinical.dev with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge your report within 48 hours and provide a timeline for a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Security Considerations

Preclinical handles healthcare AI testing data. When self-hosting:

- Always use strong database passwords (never use defaults in production)
- Keep your `OPENAI_API_KEY` and other provider keys secure
- Run behind a reverse proxy (nginx/Caddy) with TLS in production
- Regularly update Docker images and npm dependencies
