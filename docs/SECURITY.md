# Security posture — MVP

## Profile

This is a public MVP, not a production authorization boundary. Security work is proportional but non-optional: secure defaults, least privilege, testable controls and explicit residual risks.

The baseline uses OWASP Top 10:2025 for awareness and OWASP ASVS 5.0 Level 1 as the verification direction where applicable. The Top 10 is not treated as complete coverage.

## Implemented controls

- dependency-free Node serving path; no server-side user data or authentication;
- path traversal containment and GET/HEAD-only normal public HTTP surface;
- the OTLP receiver, reset endpoint and evidence-query API are enabled only when `EVIDENCE_TEST_MODE=1`; the normal public MVP does not expose those POST/query endpoints;
- the test-mode OTLP JSON receiver accepts only `application/json` and bounds request bodies to 1 MB;
- CSP, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, X-Frame-Options and COOP headers;
- camera is requested only on user action, remains local to the browser, and is not uploaded;
- MediaPipe is optional, on-device, and mapped to three bounded commands;
- no secret or long-lived cloud key is expected in the repository; Google Cloud deployment is designed for Workload Identity Federation/OIDC;
- container runs as the unprivileged `node` user;
- runtime image is pinned to the current Node 22 LTS patch line and an explicit Alpine release rather than an old floating base;
- npm, npx, Corepack and Yarn are removed from the runtime image because this service performs no package installation at runtime; this reduces unused supply-chain and executable surface;
- CodeQL, gitleaks and Trivy checks are defined in GitHub Actions;
- all runtime CDN dependencies are version-pinned.

## Accepted MVP residual risk

TypeGPU and MediaPipe are currently loaded as exact-version browser ESM modules from jsDelivr, and the MediaPipe model is fetched from Google storage. ESM imports do not provide Subresource Integrity. This is accepted for the bounded MVP but is a supply-chain exposure; before a stronger production profile, bundle/vendor dependencies in the build, generate an SBOM, lock hashes/digests, and narrow CSP to self-hosted assets.

The container image tag pins a patch version but not an immutable registry digest. A stronger profile should pin the verified image digest and automate controlled dependency refreshes.

The in-memory OTLP receiver is a test reference implementation, not an authenticated production telemetry API. `EVIDENCE_TEST_MODE` MUST NOT be enabled on the public MVP deployment. A production telemetry evidence service requires explicit authentication/authorization, tenant and data-boundary decisions, retention rules and a hardened Collector/backend path.

Web Speech recognition, when enabled by the browser, may use browser/vendor services. It is optional and must not be used for secrets or sensitive conference material without an approved deployment profile.

## Checks

`npm run verify` performs local syntax/policy/unit checks. GitHub Actions adds CodeQL, secret scanning, Trivy filesystem/container scanning and the Playwright browser reference suite. The Playwright telemetry-evidence run also proves that the test-only centralizer is disabled by configuration unless explicitly enabled by the test server. A security finding is not waived by the label “MVP”; it is either fixed, documented as not applicable, or explicitly accepted with scope and expiry.
