# Interactive Evidence Presenter

Turn scientific results into interactive, explainable, multimodal presentations backed by evidence.

Canonical repository: `gharbonnier78/interactive-evidence-presenter`.

## MVP v0.2 review

The bounded MVP now demonstrates multiple reviewable product paths on real Study 0 evidence:

- interactive presentation navigation;
- selection of visible text as a semantic query, not only predefined buttons;
- known-text resolution (`PCA`) through the Diderot/local tier;
- negative selection proof: an unrelated selected word remains unresolved even when nearby context contains known concepts;
- click selection of Study 0 chart regions through the same semantic resolver contract;
- Diderot-first bounded knowledge resolution with explicit provenance and explicit internet fallback when unresolved;
- explicit separation between intentional `local-static-preview` and real `api-error` behavior;
- a deterministic, evidence-bounded “Emma” assistant;
- presenter webcam tile kept local to the browser;
- optional MediaPipe gesture control: Thumb Up → next, Victory → previous, Open Palm → cancel;
- TypeGPU/WebGPU computation for chart normalization, with an explicit CPU fallback;
- stable logical service APIs for semantic manifest, semantic resolution, knowledge lookup and bounded explanation while keeping one deployable process for the MVP;
- OpenTelemetry traces, correlated logs and metric exemplars used as engineering-test evidence in the Playwright qualification lane;
- SpanId-centric evidence retrieval with TraceId preserved and expected-versus-actual validation;
- a generated UAT Evidence Book with activity/sequence views, expected outcomes, executed results, screenshots, OTEL evidence and SHA-256 evidence manifest;
- Study 0 claim status and corrected confidence-bound values kept visibly separate from explanation.

No graph database, runtime LLM, avatar, multi-agent system, autonomous web research or video upload is required for this MVP.

## Run locally

```bash
npm run verify
npm start
# open http://localhost:8080
```

Try selecting the visible text `PCA` directly in the presentation surface. The semantic panel should identify the Diderot/local tier. Select an unknown word such as `presentation`: it must stay unresolved rather than inherit a nearby PCA/FNMR concept. Click the PCA chart bar to send a `figure-region` selection through the same resolver.

The service contracts are documented in `docs/SERVICE_APIS.md`.

## Browser qualification suite

```bash
npm install
npx playwright install chromium
npm run test:e2e
npm run uat:report
npm run test:e2e:report
```

The reference UAT lane keeps planned screenshots even when tests pass. It also retains raw OTEL evidence bundles, machine-readable validation results and a human-readable expected-versus-actual comparison. The UAT report generator turns those artifacts into HTML and PDF review books.

The semantic UAT has three bounded subpaths: `UC-002A` known text, `UC-002B` unknown text/fallback, and `UC-002C` figure-region selection. Separate regression tests also force an API 500 and verify that it surfaces as `API error`, and exercise 400/413/415 semantic API guards.

`npm run test:e2e:codegen` opens Playwright Codegen against a locally running presenter. Codegen output is treated as a candidate artifact to review, not as automatically trusted coverage.

## Engineering care

This repository uses the **MVP** engineering-care profile from `scientific-research-harness`:

- system/software architecture: `docs/ARCHITECTURE.md`;
- service/API boundaries: `docs/SERVICE_APIS.md`;
- code decomposition/change rules: `docs/CODE_STRUCTURE.md`;
- telemetry evidence: `docs/TELEMETRY_EVIDENCE.md`;
- UAT evidence-book contract: `docs/UAT_EVIDENCE_BOOK.md`;
- test-generation comparison contract: `docs/TEST_GENERATION_LAB.md`;
- security posture and residual risks: `docs/SECURITY.md`;
- deployment contract: `docs/DEPLOYMENT.md`;
- harness adoption and gates: `harness-adoption.yaml`.

Local verification runs focused unit tests plus static policy checks. GitHub Actions adds container smoke tests, the blocking Playwright Chromium UAT/reference suite, generated HTML/PDF evidence books, CodeQL, gitleaks and Trivy filesystem/container scans.

Allure remains deferred until cross-framework/campaign history justifies it. OpenTelemetry is already present because it answers a concrete qualification question: can the expected internal path and values be recovered by SpanId and retained as evidence alongside external UI assertions?

## Security and provenance boundary

The camera is user-initiated and is not posted to the server. MediaPipe processing is performed in the browser. TypeGPU `0.12.1` and MediaPipe Tasks Vision `1.0.1` are version-pinned browser dependencies. Their current CDN delivery is an explicitly recorded MVP supply-chain risk to remove before a stronger production profile.

The current Diderot resolver is a bounded local projection, not a claim that the complete wiki is already live-indexed at runtime. Context is disambiguation-only and cannot manufacture a semantic match. Unknown selections are not hallucinated into local knowledge: the UI exposes an explicit web fallback instead.

Cloud deployment is designed for keyless/OIDC authentication rather than a long-lived cloud credential.
