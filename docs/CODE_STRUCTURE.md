# Code structure and change rules

The codebase is deliberately small enough to review without generated framework code. Pure decision logic lives in `app/core.mjs`; browser side effects stay in adapters and `main.mjs`; the server has no third-party runtime package dependency.

Reference browser behavior is exercised in `e2e/` with Playwright. `playwright.config.mjs` owns browser-test execution/reporting policy; generated-test experiments belong under an explicitly identified experimental path and MUST NOT silently replace the human-reviewed reference suite. The comparison method and evidence contract live in `docs/TEST_GENERATION_LAB.md`.

When adding a feature, keep one directional dependency: `main -> adapters/core`, never `core -> DOM/network`. New commands or claim wording require unit tests. User-visible workflow changes that matter to the MVP should update or justify the Playwright reference path. New external origins require a deliberate CSP update and a security note. New camera or microphone behavior must remain user-initiated and documented.

A POC/MVP change should prefer deletion or a small adapter over a new framework. Add infrastructure only when a measured or user-visible need justifies it. Reporting/telemetry layers such as Allure or OpenTelemetry are added only when the existing Playwright reports and CI artifacts no longer answer the decision question efficiently.
