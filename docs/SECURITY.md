# Security posture — MVP

## Profile

This is a public MVP, not a production authorization boundary. Security work is proportional but non-optional: secure defaults, least privilege, testable controls and explicit residual risks.

The baseline uses OWASP Top 10:2025 for awareness and OWASP ASVS 5.0 Level 1 as the verification direction where applicable. The Top 10 is not treated as complete coverage.

## Implemented controls

- dependency-free Node serving path; no server-side user data or authentication;
- path traversal containment and GET/HEAD-only HTTP surface;
- CSP, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, X-Frame-Options and COOP headers;
- camera is requested only on user action, remains local to the browser, and is not uploaded;
- MediaPipe is optional, on-device, and mapped to three bounded commands;
- no secret or long-lived cloud key is expected in the repository; Google Cloud deployment is designed for Workload Identity Federation/OIDC;
- container runs as the unprivileged `node` user;
- runtime image is pinned to the current Node 22 LTS patch line and an explicit Alpine release rather than an old floating base;
- CodeQL, gitleaks and Trivy checks are defined in GitHub Actions;
- all runtime CDN dependencies are version-pinned.

## Accepted MVP residual risk

TypeGPU and MediaPipe are currently loaded as exact-version browser ESM modules from jsDelivr, and the MediaPipe model is fetched from Google storage. ESM imports do not provide Subresource Integrity. This is accepted for the bounded MVP but is a supply-chain exposure; before a stronger production profile, bundle/vendor dependencies in the build, generate an SBOM, lock hashes/digests, and narrow CSP to self-hosted assets.

The container image tag pins a patch version but not an immutable registry digest. A stronger profile should pin the verified image digest and automate controlled dependency refreshes.

Web Speech recognition, when enabled by the browser, may use browser/vendor services. It is optional and must not be used for secrets or sensitive conference material without an approved deployment profile.

## Checks

`npm run verify` performs local syntax/policy/unit checks. GitHub Actions adds CodeQL, secret scanning, Trivy filesystem/container scanning and the Playwright browser reference suite. A security finding is not waived by the label “MVP”; it is either fixed, documented as not applicable, or explicitly accepted with scope and expiry.
