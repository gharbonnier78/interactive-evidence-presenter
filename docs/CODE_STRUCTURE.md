# Code structure and change rules

The codebase is deliberately small enough to review without generated framework code. Pure decision logic lives in `app/core.mjs`; browser side effects stay in adapters and `main.mjs`; the server has no third-party runtime package dependency.

Reference browser behavior is exercised in `e2e/` with Playwright. `playwright.config.mjs` owns browser-test execution/reporting policy; generated-test experiments belong under an explicitly identified experimental path and MUST NOT silently replace the human-reviewed reference suite. The comparison method lives in `docs/TEST_GENERATION_LAB.md`.

The telemetry-evidence path has explicit boundaries:

- `app/telemetry.mjs` emits bounded browser OTLP JSON only when a Playwright E2E trace context exists;
- `server.mjs` owns the test-mode OTLP HTTP endpoints and evidence-query API, gated by `EVIDENCE_TEST_MODE=1`;
- `telemetry-store.mjs` owns reconstruction of span descendants and correlated logs/metric exemplars;
- `e2e/contracts/*.json` declares expected telemetry independently of runtime emission code;
- `e2e/telemetry-evidence.mjs` owns expected-versus-actual validation and must not import application implementation state to manufacture the expected answer;
- `docs/models/*.puml` is the human-reviewable behavioral-model source for the bounded expected topology;
- `docs/TELEMETRY_EVIDENCE.md` records signal-format and evidence-boundary decisions.

When adding a feature, keep one directional dependency: `main -> adapters/core`, never `core -> DOM/network`. New commands or claim wording require unit tests. User-visible workflow changes that matter to the MVP should update or justify the Playwright reference path. If a modeled E2E operation changes materially, update the activity model and expected telemetry contract deliberately; do not automatically learn the expected contract from the implementation under test.

New external origins require a deliberate CSP update and a security note. New camera or microphone behavior must remain user-initiated and documented. The test-mode OTLP/evidence endpoints must remain disabled in normal public mode unless a separate authenticated production design explicitly replaces that boundary.

A POC/MVP change should prefer deletion or a small adapter over a new framework. Add infrastructure only when a measured or user-visible need justifies it. OpenTelemetry is present now because it answers a concrete E2E evidence question; Allure and a production Collector/backend stack remain deferred until cross-framework reporting or persistent multi-signal query requirements justify them.
