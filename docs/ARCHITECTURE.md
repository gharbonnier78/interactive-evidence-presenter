# Architecture — MVP v0.1

## System context

Interactive Evidence Presenter is a browser-first conference surface. In normal public mode, the browser owns presentation state, semantic evidence navigation, the presenter video, TypeGPU/WebGPU computation and optional MediaPipe gesture recognition. The server remains intentionally thin: it serves application assets and `/healthz`; it does not receive camera frames.

The E2E qualification profile adds a deliberately separate **test-only telemetry evidence path**. When `EVIDENCE_TEST_MODE=1`, the same Node process exposes bounded OTLP/HTTP JSON ingestion and a SpanId-centric evidence API so Playwright can prove an expected runtime signal topology. These endpoints are disabled in the normal public MVP.

```text
NORMAL PUBLIC MODE

Presenter
  | voice / keyboard / camera
  v
Browser ------------------------------------------------------+
  |                                                           |
  +-- Presentation state + deterministic Emma assistant       |
  +-- Study 0 evidence model                                  |
  +-- TypeGPU/WebGPU normalization -> chart                   |
  +-- MediaPipe gesture recognizer (optional, on-device)      |
  +-- local <video> tile                                      |
  |                                                           |
  +---------------- HTTPS ------------------------------------+
                                                              |
Node static server <------------------------------------------+
  | security headers + health check
  v
Public application assets


E2E EVIDENCE TEST MODE

UML activity model
      |
      v
Expected telemetry contract -------------------------------+
                                                            |
Playwright root SpanId + TraceId                            |
      |                                                     |
      +-- traceparent --> GET / --> HTTP SERVER span        |
      |                                                     |
      +-- browser context --> presenter/evidence/nav/PCA    |
                               spans + logs + metrics        |
                                      |                     |
                                      | OTLP/HTTP JSON       |
                                      v                     |
                             test-only OTLP receiver         |
                                      |                     |
                                      v                     |
                           in-memory TelemetryStore          |
                                      |                     |
          GET /api/evidence/v1/spans/{rootSpanId} <---------+
                                      |
                                      v
                         expected vs actual validator
                                      |
                                      v
                         Playwright report attachments
```

## Software decomposition

- `app/core.mjs`: evidence model, concepts, command parsing, bounded responses. Pure and unit-tested.
- `app/main.mjs`: DOM orchestration, navigation, canvas rendering, camera and voice wiring; emits bounded application spans through the telemetry adapter when an E2E trace context is injected.
- `app/telemetry.mjs`: test-context-aware OTLP JSON browser emitter for application spans, correlated LogRecords and interaction-duration histogram exemplars. Inactive without an injected E2E context.
- `app/typegpu.mjs`: pinned TypeGPU 0.12.1 adapter. Performs chart-value normalization on WebGPU when available and returns an explicit CPU fallback otherwise.
- `app/mediapipe.mjs`: pinned MediaPipe Tasks Vision 1.0.1 adapter. Maps three canned gestures only: Thumb Up → next, Victory → previous, Open Palm → cancel.
- `server.mjs`: dependency-free static HTTP server; in test mode only, also exposes bounded OTLP ingestion and SpanId/TraceId evidence-query endpoints and records the HTTP SERVER span from incoming `traceparent`.
- `telemetry-store.mjs`: in-memory reference centralizer. Reconstructs a selected span subtree by `parentSpanId`, then joins correlated logs and metric exemplars.
- `e2e/contracts/E2E-REFERENCE-001.json`: executable expected span/log/metric contract derived from the bounded activity model.
- `e2e/telemetry-evidence.mjs`: Playwright-side TraceId/SpanId generation, root-span emission, polling and expected-versus-actual validator.
- `docs/models/E2E-REFERENCE-001.puml`: human-reviewable UML activity source for the reference telemetry path.

## Evidence boundary

Scientific source artifacts remain in `siamese-embedding-compression-lab`. The MVP bundles a small, explicitly bounded projection of Study 0 for presentation. It may explain those values but may not mutate the source claim status. The UI labels `C-NI-001` as `NOT_DEMONSTRATED`.

Runtime telemetry remains distinct from scientific evidence. In the E2E lane, telemetry becomes **engineering test evidence** only because the expected topology and values are declared before execution, the actual signals are retrieved by SpanId, and the raw bundle plus comparison verdict are retained in the Playwright report.

## MVP constraints and deliberate non-goals

No Neo4j, no general knowledge graph, no runtime LLM, no video upload, no avatar, no multi-agent system, and no claim-bearing experiment execution. TypeGPU is used for a real but small compute step; no performance claim is made from it.

The in-memory telemetry receiver is not the final observability architecture. Its purpose is to prove the signal/evidence contract and SpanId retrieval API. A later production-like phase may replace it with an OpenTelemetry Collector and queryable trace/log/metric backends while preserving the evidence API and validator semantics.
