# Architecture — MVP v0.1

## System context

Interactive Evidence Presenter is a browser-first conference surface. The browser owns presentation state, semantic evidence navigation, the presenter video, TypeGPU/WebGPU computation and optional MediaPipe gesture recognition. The Cloud Run service is intentionally thin: it serves immutable application assets and exposes `/healthz`; it does not receive camera frames.

```text
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
Cloud Run: static Node server <-------------------------------+
  | security headers + health check
  v
Public application assets
```

## Software decomposition

- `app/core.mjs`: evidence model, concepts, command parsing, bounded responses. Pure and unit-tested.
- `app/main.mjs`: DOM orchestration, navigation, canvas rendering, camera and voice wiring.
- `app/typegpu.mjs`: pinned TypeGPU 0.12.1 adapter. Performs chart-value normalization on WebGPU when available and returns an explicit CPU fallback otherwise.
- `app/mediapipe.mjs`: pinned MediaPipe Tasks Vision 1.0.1 adapter. Maps three canned gestures only: Thumb Up → next, Victory → previous, Open Palm → cancel.
- `server.mjs`: dependency-free static HTTP server with path containment and security headers.

## Evidence boundary

Scientific source artifacts remain in `siamese-embedding-compression-lab`. The MVP bundles a small, explicitly bounded projection of Study 0 for presentation. It may explain those values but may not mutate the source claim status. The UI labels `C-NI-001` as `NOT_DEMONSTRATED`.

## MVP constraints and deliberate non-goals

No Neo4j, no general knowledge graph, no runtime LLM, no video upload, no avatar, no multi-agent system, and no claim-bearing experiment execution. TypeGPU is used for a real but small compute step; no performance claim is made from it.
