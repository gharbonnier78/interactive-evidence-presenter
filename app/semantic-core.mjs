import { CONCEPTS, STUDY, SLIDES } from './core.mjs';

const DIDEROT_REPOSITORY = 'gharbonnier78/mmals-ml-wiki';
const DIDEROT_HOME = 'https://github.com/gharbonnier78/mmals-ml-wiki';

const ALIASES = Object.freeze({
  pca: ['pca', 'principal component analysis', 'principal components', 'projection pca'],
  fnmr: ['fnmr', 'false non-match rate', 'false non match rate', 'non-match rate'],
  ucb: ['97.5% ucb', 'ucb', 'upper confidence bound', 'confidence bound'],
  bootstrap: ['subject-slot bootstrap', 'bootstrap', 'resampling'],
  siamese: ['siamese', 'siamese projection', 'shared projection']
});

const SEMANTIC_HINTS = Object.freeze({
  'study0.route.1': 'pca',
  'study0.route.2': 'siamese'
});

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedText(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function getDiderotConcept(id) {
  const concept = CONCEPTS[id];
  if (!concept) return null;
  return {
    semanticId: `concept:${id}`,
    conceptId: id,
    title: concept.title,
    intuition: concept.short,
    detail: concept.deep,
    claimId: STUDY.claim,
    source: {
      tier: 'diderot',
      kind: 'bundled-projection',
      repository: DIDEROT_REPOSITORY,
      url: DIDEROT_HOME,
      note: 'MVP projection of Diderot-style knowledge. The live wiki search connector is not yet wired into runtime.'
    }
  };
}

export function semanticManifest() {
  return {
    schemaVersion: '1.1',
    presentationId: 'interactive-evidence-presenter-mvp',
    slides: SLIDES.map((slide) => ({ id: slide.id, title: slide.title })),
    concepts: Object.keys(CONCEPTS).map((id) => getDiderotConcept(id)),
    selectionModes: ['text-selection', 'concept-click', 'figure-region'],
    resolverPriority: ['diderot', 'internet-fallback'],
    contextPolicy: 'disambiguation-only'
  };
}

export function resolveSemanticSelection(input = {}) {
  const text = boundedText(input.text, 180);
  const context = boundedText(input.context, 500);
  const query = normalized(text);
  const normalizedContext = normalized(context);
  const candidates = [];

  if (input.elementType === 'figure-region' && typeof input.semanticHint === 'string') {
    const hintedId = SEMANTIC_HINTS[input.semanticHint];
    if (hintedId && CONCEPTS[hintedId]) {
      candidates.push({ id: hintedId, score: 2000, matchedAlias: input.semanticHint, matchKind: 'semantic-hint' });
    }
  }

  for (const [id, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalized(alias);
      const exact = query === normalizedAlias;
      const contained = Boolean(query) && (query.includes(normalizedAlias) || normalizedAlias.includes(query));
      if (!exact && !contained) continue;

      // Context can rank candidates that already matched the selected element,
      // but it must never create a semantic match on its own.
      const contextBoost = normalizedContext.includes(normalizedAlias) ? 25 : 0;
      const score = (exact ? 1000 : 500) + normalizedAlias.length + contextBoost;
      candidates.push({ id, score, matchedAlias: alias, matchKind: exact ? 'exact' : 'selected-text' });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;

  const base = {
    schemaVersion: '1.1',
    query: {
      text,
      context,
      slideId: input.slideId ?? null,
      elementType: input.elementType ?? 'text',
      semanticHint: input.semanticHint ?? null
    }
  };

  if (!best) {
    return {
      ...base,
      status: 'unresolved',
      semantic: null,
      knowledge: null,
      fallback: {
        required: true,
        nextTier: 'internet',
        query: text,
        webSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(text)}`,
        note: 'Internet fallback is intentionally user-triggered in this review MVP; no external result is promoted to canonical evidence automatically.'
      }
    };
  }

  const knowledge = getDiderotConcept(best.id);
  return {
    ...base,
    status: 'resolved',
    semantic: {
      id: knowledge.semanticId,
      type: 'concept',
      conceptId: knowledge.conceptId,
      title: knowledge.title,
      matchedAlias: best.matchedAlias,
      matchKind: best.matchKind
    },
    knowledge,
    fallback: { required: false, nextTier: null }
  };
}

export function renderBoundedExplanation(resolution, depth = 'intuition') {
  if (!resolution || resolution.status !== 'resolved' || !resolution.knowledge) {
    return {
      status: resolution?.status === 'error' ? 'error' : 'unresolved',
      depth,
      title: resolution?.status === 'error' ? 'Resolver unavailable' : (resolution?.query?.text || 'Selection'),
      text: resolution?.status === 'error'
        ? 'The semantic API failed. The application did not silently replace that failure with a local answer.'
        : 'No matching concept exists in the bounded Diderot projection for this MVP. Use the explicit internet fallback if you want to continue outside the local evidence boundary.',
      source: { tier: 'none' },
      fallback: resolution?.fallback ?? null
    };
  }

  const knowledge = resolution.knowledge;
  const allowedDepth = ['intuition', 'detail'].includes(depth) ? depth : 'intuition';
  return {
    status: 'resolved',
    depth: allowedDepth,
    semanticId: knowledge.semanticId,
    title: knowledge.title,
    text: allowedDepth === 'detail' ? knowledge.detail : knowledge.intuition,
    claimId: knowledge.claimId,
    source: knowledge.source,
    fallback: { required: false }
  };
}
