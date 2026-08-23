# Architecture — MVP v0.2 review

## System context

Interactive Evidence Presenter is a browser-first conference surface. In normal public mode, the browser owns presentation state, semantic selection, presenter video, TypeGPU/WebGPU computation and optional MediaPipe gesture recognition. The Node backend remains deliberately small, but it now exposes stable **logical service APIs** for presentation semantics, Diderot-first knowledge resolution and bounded explanation.

These are service boundaries, not independently deployed microservices yet. Keeping them in one process lets the MVP validate contracts and behavior without adding distributed-system ceremony before there is evidence that separate deployment is useful.

The E2E qualification profile adds a deliberately separate **test-only telemetry evidence path**. When `EVIDENCE_TEST_MODE=1`, the same Node process exposes bounded OTLP/HTTP JSON ingestion and a SpanId-centric evidence API so Playwright can prove an expected runtime signal topology. These evidence endpoints are disabled in the normal public MVP.

```text
NORMAL PUBLIC / REVIEW MODE

Presenter
  | mouse / text selection / chart selection / voice / camera
  v
Browser ---------------------------------------------------------------+
  |                                                                    |
  +-- Presentation state + deterministic Emma assistant                |
  +-- Semantic selection router                                        |
  |      |                                                             |
  |      +-- text selection                                            |
  |      +-- explicit concept click                                    |
  |      +-- figure-region click                                       |
  |                                                                    |
  +-- TypeGPU/WebGPU normalization -> chart                            |
  +-- MediaPipe gesture recognizer (optional, on-device)               |
  +-- local <video> tile                                               |
  |                                                                    |
  +---------------- HTTPS ---------------------------------------------+
                                                                       |
Node service host <----------------------------------------------------+
  |
  +-- GET  /api/presentation/v1/semantic-manifest
  +-- POST /api/semantic/v1/resolve
  +-- GET  /api/knowledge/v1/concepts/{id}
  +-- POST /api/explanations/v1/render
  +-- GET  /healthz

Resolver priority
  Diderot bounded projection
        |
        +--> project evidence (next expansion)
        |
        +--> explicit internet fallback when unresolved

STATIC REVIEW PREVIEW
  GitHub Pages cannot run the Node APIs, so the browser executes the same
  pure semantic resolver locally and labels the transport explicitly as
  `local-static-preview`.


E2E EVIDENCE TEST MODE

UML activity / sequence model
      |
      v
Expected telemetry contract ----------------------------------------+
                                                                     |
Playwright root SpanId + TraceId                                     |
      |                                                              |
      +-- traceparent --> GET / --> HTTP SERVER span                 |
      |                                                              |
      +-- browser context --> presenter/evidence/navigation/semantic |
                               spans + logs + metrics                 |
                                      |                              |
                                      | OTLP/HTTP JSON                |
                                      v                              |
                             test-only OTLP receiver                  |
                                      |                              |
                                      v                              |
                           in-memory TelemetryStore                   |
                                      |                              |
          GET /api/evidence/v1/spans/{rootSpanId} <------------------+
                                      |
                                      v
                         expected vs actual validator
                                      |
                                      v
                    Playwright + UAT evidence book
```

## Software decomposition

- `app/core.mjs`: scientific/presentation evidence model, concepts, command parsing and bounded responses. Pure and unit-tested.
- `app/semantic-core.mjs`: pure Diderot-first semantic resolution, bounded knowledge projection, explanation rendering and semantic manifest. Shared by the Node APIs and static preview fallback.
- `app/main.mjs`: DOM orchestration, navigation, semantic text/figure selection, canvas rendering, camera and voice wiring; emits bounded application spans when an E2E trace context is injected.
- `app/telemetry.mjs`: test-context-aware OTLP JSON browser emitter for application spans, correlated LogRecords and interaction-duration histogram exemplars. Inactive without an injected E2E context.
- `app/typegpu.mjs`: pinned TypeGPU 0.12.1 adapter. Performs chart-value normalization on WebGPU when available and returns an explicit CPU fallback otherwise.
- `app/mediapipe.mjs`: pinned MediaPipe Tasks Vision 1.0.1 adapter. The current gesture vocabulary remains deliberately small; geometric hand-to-semantic pointing is a later bounded use case.
- `server.mjs`: dependency-free HTTP service host. It serves application assets, health, the base semantic/knowledge/explanation APIs, and — only in evidence test mode — OTLP ingestion plus SpanId/TraceId evidence query endpoints.
- `telemetry-store.mjs`: in-memory reference centralizer. Reconstructs a selected span subtree by `parentSpanId`, then joins correlated logs and metric exemplars.
- `e2e/contracts/*.json`: executable expected span/log/metric contracts derived from bounded behavioral models.
- `e2e/scenarios/*.json`: UAT use-case specifications with activity/sequence views, expected results and planned screenshot evidence.
- `e2e/telemetry-evidence.mjs`: Playwright-side TraceId/SpanId generation, root-span emission, polling and expected-versus-actual validator.
- `scripts/build-uat-report.mjs`: builds the narrative UAT evidence book from machine-readable execution evidence.

## Semantic interaction boundary

The MVP now accepts a selection from any visible text fragment in the presentation surface. The resolver attempts a local Diderot knowledge match first. Known terms such as PCA, FNMR, UCB, bootstrap and Siamese resolve to bounded explanations with provenance. Unknown text remains selectable but is explicitly marked unresolved and exposes a user-triggered internet fallback rather than inventing a local answer.

The chart is also a semantic surface: clicking a Study 0 route creates a `figure-region` selection that is sent through the same resolver contract. This proves that text and figure interactions can share one semantic API before adding camera/hand pointing.

## Evidence boundary

Scientific source artifacts remain in `siamese-embedding-compression-lab`. The MVP bundles a small, explicitly bounded projection of Study 0 for presentation. It may explain those values but may not mutate the source claim status. The UI labels `C-NI-001` as `NOT_DEMONSTRATED`.

The current Diderot resolver is also a bounded projection, not a claim that the complete `mmals-ml-wiki` has been live-indexed at runtime. Its source object says this explicitly. Internet fallback remains exploratory and is never promoted to canonical evidence automatically.

Runtime telemetry remains distinct from scientific evidence. In the E2E lane, telemetry becomes **engineering test evidence** only because the expected topology and values are declared before execution, the actual signals are retrieved by SpanId, and the raw bundle plus comparison verdict are retained in the Playwright/UAT report.

## MVP constraints and deliberate non-goals

No Neo4j, no general graph database, no runtime LLM, no autonomous internet research, no video upload, no avatar, no multi-agent system, and no claim-bearing experiment execution. TypeGPU is used for a real but small compute step; no performance claim is made from it.

Logical service boundaries are intentionally **not** split into separate containers/services yet. Separation should follow measured need such as independent scaling, security boundaries, ownership, or deployment cadence.

The in-memory telemetry receiver is not the final observability architecture. Its purpose is to prove the signal/evidence contract and SpanId retrieval API. A later production-like phase may replace it with an OpenTelemetry Collector and queryable trace/log/metric backends while preserving the evidence API and validator semantics.
