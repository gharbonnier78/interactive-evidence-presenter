# Base service APIs — MVP v0.2 review

## Intent

The product has logical service boundaries but does **not** split them into independently deployed microservices yet. The MVP keeps one Node process so the contracts can be exercised without paying unnecessary distributed-system cost. The HTTP contracts below are intended to stay stable if later deployments separate these responsibilities.

The implemented runtime priority for semantic explanation is:

`Diderot/local knowledge -> explicit internet fallback`.

The current implementation includes a bounded local Diderot-style projection for PCA, FNMR, UCB, subject-slot bootstrap and Siamese projection. It does not yet perform a live runtime search of the whole `mmals-ml-wiki` repository. Unknown selections are returned as unresolved with an explicit web-fallback URL; no web result is silently promoted to canonical evidence.

**Context policy:** surrounding text is `disambiguation-only`. It may rank candidates that already matched the selected element, but it must not manufacture a concept match by itself. Figure selections may use an application-generated, server-whitelisted semantic hint such as `study0.route.1`.

## Presentation semantic manifest

```http
GET /api/presentation/v1/semantic-manifest
```

Returns the currently supported semantic selection modes, slide identifiers, known concepts, implemented resolver priority and context policy. This is the contract a richer client, pointing layer or future TypeGPU picking layer can inspect rather than hard-coding presentation semantics.

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
  "schemaVersion": "1.1",
  "status": "resolved",
  "semantic": {
    "id": "concept:pca",
    "type": "concept",
    "conceptId": "pca",
    "title": "PCA",
    "matchKind": "exact"
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

The API rejects unsupported media types with 415, malformed or schema-invalid semantic payloads with 400, and request bodies above the bounded 32 kB limit with 413. `text` must be a string of 1–180 normalized characters; `context` is bounded to 500 characters; `elementType` is restricted to the supported semantic modes; semantic hints are bounded and syntactically constrained.

## Knowledge service

```http
GET /api/knowledge/v1/concepts/{concept_id}
```

Returns the bounded Diderot knowledge object for a known concept. Concept identifiers are restricted to a small safe identifier grammar; missing concepts return 404 and invalid identifiers return 400.

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

Runtime mode is explicit in the page metadata.

- Canonical/server mode declares `api-preferred`: the browser calls the HTTP explanation API. A 500, network error or malformed API response is surfaced as `API error`; it is **not** silently converted into local static-preview success.
- The GitHub Pages review mirror declares `static-preview`: it intentionally executes the same pure resolver module locally and labels the provenance `Diderot · local-static-preview`.

This separation exists so the static review URL is useful without making a failed deployed API look healthy. CI and server-mode UAT exercise the real HTTP API.

## Qualification paths

The semantic UAT now covers three distinct product outcomes:

- `UC-002A`: known text (`PCA`) -> Diderot resolution;
- `UC-002B`: unknown text (`presentation`) with nearby known concepts -> unresolved + explicit internet fallback, proving context cannot create a false match;
- `UC-002C`: PCA chart region -> figure-region semantic hint -> Diderot resolution.

A separate Playwright regression test forces the explanation API to return 500 and verifies that the UI displays `API error` rather than `local-static-preview`.

## Deliberate non-goals for this PR

- no independent deployment per logical service;
- no service mesh or gateway;
- no autonomous internet search or LLM answer generation;
- no full live Diderot indexing/search service yet;
- no camera-to-slide geometric pointing service yet;
- no authorization model beyond the current public MVP scope.

The next separation trigger would be a measured need such as independent scaling, separate security boundary, independent ownership/deployment cadence, or a real external Diderot/search backend.
