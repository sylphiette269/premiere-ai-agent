# Security Policy

## Supported Versions

Security fixes are applied on the current main development line of this repository.

## Reporting a Vulnerability

Please do not open a public issue for suspected security vulnerabilities.

Instead, prepare a private report that includes:

- affected file or feature
- reproduction steps
- impact assessment
- any proof-of-concept details needed to verify the issue

If a private reporting channel is not yet configured for the GitHub repository, open a minimal issue that only asks for a secure contact path and do not include exploit details.

## Repository-Specific Notes

Please pay extra attention to reports involving:

- bridge directory or command file handling
- plugin registration or plugin execution paths
- ExtendScript string generation and command injection
- file path validation and traversal boundaries
- CEP panel recovery or bridge mode fallback behavior
