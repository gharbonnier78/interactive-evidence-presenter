# Telemetry evidence — E2E reference lane

## Purpose

The E2E test does not use telemetry as a dashboard-only concern. It treats runtime telemetry as **engineering test evidence** when the signals are declared before execution and the actual correlated signals are recovered and checked after execution.

Scientific evidence remains a separate category. Passing this telemetry contract proves only the bounded software behavior and observability contract exercised by the test.

## Authoritative signal format

The test-mode transport follows OpenTelemetry Protocol over HTTP with JSON payloads:

- `POST /v1/traces`
- `POST /v1/logs`
- `POST /v1/metrics`

Trace IDs and span IDs use lower-case hexadecimal strings. OTLP JSON field names use lowerCamelCase and enum fields use integer values. Logs use the OpenTelemetry LogRecord trace-context fields. Metrics use exemplars to correlate an individual measurement with its trace and span instead of adding trace IDs as high-cardinality metric attributes.

The implementation intentionally uses standard semantic-convention attributes where an OpenTelemetry convention exists. The server HTTP span uses `http.request.method`, `url.path` and `http.response.status_code`. Presenter-specific concepts are namespaced under `iep.*`.

## Model -> expected topology -> actual topology

The bounded activity model is `docs/models/E2E-REFERENCE-001.puml`. Its machine-readable expected telemetry contract is `e2e/contracts/E2E-REFERENCE-001.json`.

For this MVP the transformation from UML activity model to JSON contract is reviewed/manual; it is not yet an automatic UML parser. The contract is nevertheless executable and versioned.

The E2E root span is the entry handle:

```text
test.e2e.reference_evidence_navigation       <root SpanId>
|
+-- GET /                                    HTTP SERVER span
+-- iep.presenter.open                       browser INTERNAL span
+-- iep.evidence.render                      browser INTERNAL span
+-- iep.slide.navigate                       browser INTERNAL span
+-- iep.concept.open                         browser INTERNAL span
```

Every child shares the root trace ID and has the root SpanId as its parent for this simple scenario. Future nested UML activities may form deeper span trees.

## Centralizer API

The server exposes a deliberately test-only in-memory OTLP receiver when `EVIDENCE_TEST_MODE=1`. The endpoints are disabled in the normal public MVP.

The primary evidence query is:

```http
GET /api/evidence/v1/spans/{span_id}
```

It resolves the entry span, its trace ID, all descendants linked through `parentSpanId`, correlated LogRecords, metric points whose exemplars reference a span in the subtree, and the raw OTLP payloads received during the test.

A secondary whole-trace query is also available:

```http
GET /api/evidence/v1/traces/{trace_id}
```

The in-memory receiver is a proof of the evidence contract, not the final observability backend. A later deployment can replace storage/query implementation with an OpenTelemetry Collector plus trace/log/metric backends while preserving this evidence API and validator contract.

## Playwright validation

`e2e/reference.spec.mjs` performs both external UI assertions and internal telemetry assertions. It:

1. creates a random valid TraceId and root SpanId;
2. propagates the W3C `traceparent` header to the server request and injects the same root context into the browser test page;
3. executes the UI scenario;
4. flushes emitted OTLP traces, logs and metrics;
5. records the Playwright root span;
6. calls `GET /api/evidence/v1/spans/{root_span_id}`;
7. validates exact expected spans, parent-child relations, attributes, logs, error-log absence and metric exemplars;
8. attaches the raw evidence bundle and expected-vs-actual verdict to the Playwright report.

The report attachments are:

- `otel-evidence-bundle.json` — recovered spans/logs/metrics plus raw received OTLP payloads;
- `otel-validation.json` — machine-readable validation result;
- `otel-expected-vs-actual.txt` — human-readable comparison.

Any missing span, wrong parent, wrong expected value, missing correlated log, missing metric exemplar, unexpected span, excessive measured duration, or error-level log makes the E2E test fail.

## Scope and next step

This is intentionally an MVP implementation. It proves the contract and retrieval/validation mechanism without adding a production Collector/backend stack. The next architecture step is to keep the same `GET spanId` evidence API while moving signal storage behind an OpenTelemetry Collector and queryable trace/log/metric backends, then prove equivalence with the in-memory reference implementation.
