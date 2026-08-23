# UAT Evidence Book

## Intent

The Playwright suite is not limited to a pass/fail browser check. For qualification-style scenarios it produces a reviewable narrative artifact that can be read like a UAT book:

`use case -> activity view -> sequence view -> executed steps -> screenshot evidence -> expected vs actual -> OpenTelemetry evidence -> retained evidence manifest`.

The book is a presentation layer over machine-readable evidence, not a replacement for it.

## Passing screenshots are deliberate evidence

Playwright's global `screenshot: only-on-failure` policy remains useful for unexpected failures. In addition, qualification scenarios explicitly capture screenshots at declared milestones even when the test passes. Those screenshots are named in `e2e/scenarios/*.json`, written under `test-results/uat-evidence/<scenario>/`, attached to the Playwright test, embedded in the UAT report and hashed in the evidence manifest.

This distinction is intentional:

- automatic failure screenshot = diagnostic evidence when a test fails unexpectedly;
- milestone screenshot = planned UAT evidence showing the observed state after a specified action.

## Scenario specification

Each qualification scenario has a versioned JSON definition under `e2e/scenarios/`. The definition contains:

- use-case identifier and purpose;
- actor and preconditions;
- activity-flow elements and their expected telemetry spans;
- a sequence view describing interactions among actor, UI, evidence model, telemetry and evidence API;
- for every material sequence interaction, the expected response/outcome that makes the interaction testable;
- ordered steps with action, expected outcomes and planned screenshot names.

The sequence view is a **pre-execution behavioral specification**, not merely an architecture picture. A request/action without its expected response is incomplete for UAT purposes. Expected outcomes may include a UI state, returned business value, claim/status, protocol result, required span/log/metric signal, or evidence-retrieval result. The later execution section records what actually happened and compares it with these declared expectations.

The Playwright test records actual values and explicit check verdicts into `result.json`. Expected values are not learned from the runtime implementation after execution.

## Generated report

`scripts/build-uat-report.mjs` scans `test-results/uat-evidence/*/result.json` and generates:

- `uat-report/index.html` — browser-readable evidence book;
- `uat-report/Interactive-Evidence-Presenter-UAT-Evidence-Book.pdf` — printable review version;
- `uat-report/summary.json` — machine-readable overall summary.

The report embeds lightweight activity and sequence diagrams from the scenario definition. The sequence diagram carries the declared expected result on the interaction itself. It presents each executed step with action, expected results, actual results, verdict and screenshot. It then presents the full OpenTelemetry expected-versus-actual contract table, including SpanId/TraceId correlation, logs and metric exemplars.

## Evidence integrity and retention

For each scenario the report lists SHA-256 hashes of the retained screenshots and telemetry files. The GitHub Actions artifact includes Playwright reports, raw UAT evidence and the generated HTML/PDF book. The artifact is retained for 90 days in the MVP workflow.

A future production qualification repository may copy these artifacts into a longer-lived evidence store, sign the evidence manifest, or link the report to a release/configuration baseline. Those controls are not required to demonstrate the MVP reporting pattern.
