# Interactive Evidence Presenter

Turn scientific results into interactive, explainable, multimodal presentations backed by evidence.

Canonical repository: `gharbonnier78/interactive-evidence-presenter`.

## MVP v0.1

The first bounded MVP demonstrates one real evidence path using the Siamese Embedding Compression Study 0:

- interactive presentation navigation;
- clickable scientific concepts and pedagogical drill-down;
- a deterministic, evidence-bounded “Emma” assistant;
- presenter webcam tile kept local to the browser;
- optional MediaPipe gesture control: Thumb Up → next, Victory → previous, Open Palm → cancel;
- TypeGPU/WebGPU computation for chart normalization, with an explicit CPU fallback;
- Study 0 claim status and corrected confidence-bound values kept visibly separate from explanation;
- Cloud Run container and keyless GitHub Actions deployment path.

No Neo4j, runtime LLM, avatar, multi-agent system or video upload is required for this MVP.

## Run locally

```bash
npm run verify
npm start
# open http://localhost:8080
```

For the browser reference suite:

```bash
npm install
npx playwright install chromium
npm run test:e2e
npm run test:e2e:report
```

`npm run test:e2e:codegen` opens Playwright Codegen against a locally running presenter. Codegen output is treated as a candidate artifact to review, not as automatically trusted coverage.

## Engineering care

This repository uses the **MVP** engineering-care profile from `scientific-research-harness`:

- system/software architecture: `docs/ARCHITECTURE.md`;
- code decomposition/change rules: `docs/CODE_STRUCTURE.md`;
- test-generation comparison contract: `docs/TEST_GENERATION_LAB.md`;
- security posture and residual risks: `docs/SECURITY.md`;
- Google Cloud deployment contract: `docs/DEPLOYMENT.md`;
- harness adoption and gates: `harness-adoption.yaml`.

Local verification runs focused unit tests plus static policy checks. GitHub Actions adds container smoke tests, a blocking Playwright Chromium reference suite with HTML/JSON report artifacts, CodeQL, gitleaks and Trivy filesystem/container scans.

Allure and OpenTelemetry are deliberately deferred until the comparison/reporting questions justify those extra layers; the current CI preserves structured Playwright results so they can be promoted later without losing provenance.

## Security boundary

The camera is user-initiated and is not posted to the server. MediaPipe processing is performed in the browser. TypeGPU `0.12.1` and MediaPipe Tasks Vision `1.0.1` are version-pinned browser dependencies. Their current CDN delivery is an explicitly recorded MVP supply-chain risk to remove before a stronger production profile.

Cloud deployment is designed for Google Workload Identity Federation/OIDC rather than a long-lived service-account JSON key.
