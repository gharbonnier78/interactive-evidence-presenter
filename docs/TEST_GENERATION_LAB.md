# Test Generation Evaluation Lab

Status: MVP experiment scaffold. This is **not** a release gate for AI-generated tests yet.

## Goal

Use the same bounded application and the same behavioral target to compare ways of producing tests without confusing *test quantity* with *test value*.

The initial reference suite is human-reviewed Playwright code under `e2e/`. Candidate generation paths are evaluated against that common target:

1. human/reference Playwright;
2. Playwright Codegen capture, then human review;
3. LLM-generated Playwright from the same evidence/behavior contract;
4. Squash AI requirement-to-test-case generation;
5. Harness AI Test Automation intent/no-code test creation;
6. future generators, provided they receive an equivalent input contract.

Harness and Squash are external products and require their own accounts/licensing/configuration. They are not installed as hidden dependencies of this repository.

## Fair-comparison contract

A comparison run MUST record:

- generator/tool name and version or service release date when available;
- exact input requirement/evidence/context supplied;
- generated artifact before human correction;
- human corrections and elapsed correction time;
- executable result when the tool produces automation;
- target application commit SHA;
- pass/fail/flaky outcome and failure classification;
- defects or seeded faults detected;
- duplicated or semantically redundant tests;
- maintenance impact after a small UI change;
- cost/latency when measurable.

A generated test is not valuable merely because it executes or increases test count.

## Initial metrics

The first useful metrics are deliberately small:

- **executable_without_edit**: generated automation runs unchanged;
- **human_edit_minutes**: effort to reach an accepted executable test;
- **behavioral_coverage**: required behaviors actually asserted;
- **fault_detection**: known/seeded relevant faults caught;
- **flaky_rate**: inconsistent outcome on unchanged code;
- **locator_resilience**: survival after a non-semantic UI refactor;
- **redundancy_rate**: generated cases that add no distinct checked behavior;
- **traceability**: requirement/evidence -> generated test -> result is recoverable.

Mutation testing or fault injection MAY be added when the injected faults are representative enough to answer a specific question; mutation score is not a universal proxy for production value.

## CI policy

The **reference Playwright suite is blocking** because it checks accepted application behavior.

Generated suites start as a **non-blocking experimental lane**. They may become blocking only after the experiment shows enough stability, relevance and maintenance value. Interactive generators such as Playwright Codegen are used to create candidate artifacts outside CI; CI executes and compares the resulting versioned tests.

## Reporting now

Playwright produces two artifacts in CI:

- HTML report for human review;
- JSON result file for later aggregation.

Failures retain Playwright trace, screenshot and video artifacts. This is sufficient for the MVP; Allure is intentionally deferred until cross-framework/campaign history justifies the extra reporting layer.

## Telemetry evolution

For now, evaluation data should remain explicit JSON/artifact evidence. A later OpenTelemetry mapping can promote stable concepts such as:

- `test.generated`;
- `test.executed`;
- `test.failed`;
- `test.flaky`;
- `test.human_corrected`;
- `defect.detected`;
- `generator.duration`;
- `generator.cost`.

Do not add a Collector/backend merely to claim observability. Add OpenTelemetry when there is a concrete dashboard/correlation question that CI artifacts no longer answer well.
