# Base service APIs — MVP v0.2 review

## Intent

The product has logical service boundaries but does **not** split them into independently deployed microservices yet. The MVP keeps one Node process so the contracts can be exercised without paying unnecessary distributed-system cost. The HTTP contracts below are intended to stay stable if later deployments separate these responsibilities.

The runtime priority for semantic explanation is:

`Diderot/local knowledge -> project evidence -> explicit internet fallback`.

The current implementation includes a bounded local Diderot-style projection for PCA, FNMR, UCB, subject-slot bootstrap and Siamese projection. It does not yet perform a live runtime search of the whole `mmals-ml-wiki` repository. Unknown selections are returned as unresolved with an explicit web-fallback URL; no web result is silently promoted to canonical evidence.

## Presentation semantic manifest

```http
GET /api/presentation/v1/semantic-manifest
```

Returns the currently supported semantic selection modes, slide identifiers, known concepts and resolver priority. This is the contract a richer client, pointing layer or future TypeGPU picking layer can inspect rather than hard-coding presentation semantics.

## Semantic selection service

```http
POST /api/semantic/v1/resolve
Content-Type: application/json
```

Request example:

```json
{
  "text": "PCA",
  "context": "Study 0 PCA 128D route",
  "slideId": "study-0",
  "elementType": "text"
}
```

Resolved response shape:

```json
{
  "schemaVersion": "1.0",
  "status": "resolved",
  "semantic": {
    "id": "concept:pca",
    "type": "concept",
    "conceptId": "pca",
    "title": "PCA"
  },
  "knowledge": {
    "claimId": "C-NI-001",
    "source": {
      "tier": "diderot",
      "kind": "bundled-projection"
    }
  },
  "fallback": {
    "required": false
  }
}
```

Unknown terms return HTTP 200 with `status: unresolved` and `fallback.required: true`. Resolution failure is a valid product outcome, not an HTTP error.

## Knowledge service

```http
GET /api/knowledge/v1/concepts/{concept_id}
```

Returns the bounded Diderot knowledge object for a known concept. Missing concept IDs return 404.

## Explanation service

```http
POST /api/explanations/v1/render
Content-Type: application/json
```

The request uses the same selection fields as the semantic resolver plus:

```json
{ "depth": "intuition" }
```

Supported MVP depths are `intuition` and `detail`. The service re-resolves the selection itself instead of trusting a client-supplied semantic result, then returns both the resolution and bounded explanation.

## Evidence service

In qualification mode only:

```http
GET /api/evidence/v1/spans/{span_id}
GET /api/evidence/v1/traces/{trace_id}
```

These APIs recover the OpenTelemetry evidence bundle used by the Playwright UAT validator. They remain disabled in normal public mode. See `docs/TELEMETRY_EVIDENCE.md`.

## Browser/static-preview behavior

The browser first tries the HTTP explanation API. If the application is hosted as a static GitHub Pages review preview and the API is therefore unavailable, the same pure resolver module executes locally in the browser. The UI makes this visible as `Diderot · local-static-preview` rather than pretending a backend call occurred.

This fallback exists only to make the review URL useful. CI and server-mode UAT exercise the real HTTP API.

## Deliberate non-goals for this PR

- no independent deployment per logical service;
- no service mesh or gateway;
- no autonomous internet search or LLM answer generation;
- no full live Diderot indexing/search service yet;
- no camera-to-slide geometric pointing service yet;
- no authorization model beyond the current public MVP scope.

The next separation trigger would be a measured need such as independent scaling, separate security boundary, independent ownership/deployment cadence, or a real external Diderot/search backend.
