import test from 'node:test';
import assert from 'node:assert/strict';
import { getDiderotConcept, renderBoundedExplanation, resolveSemanticSelection, semanticManifest } from '../app/semantic-core.mjs';

test('resolves PCA from selected text through the Diderot tier', () => {
  const result = resolveSemanticSelection({ text: 'PCA', context: 'Study 0 PCA 128D route', slideId: 'study-0', elementType: 'text' });
  assert.equal(result.status, 'resolved');
  assert.equal(result.semantic.id, 'concept:pca');
  assert.equal(result.knowledge.source.tier, 'diderot');
  assert.equal(result.fallback.required, false);
});

test('context may disambiguate but cannot create a semantic match', () => {
  const result = resolveSemanticSelection({
    text: 'presentation',
    context: 'A presentation with buttons PCA FNMR UCB Bootstrap Siamese.',
    elementType: 'text'
  });
  assert.equal(result.status, 'unresolved');
  assert.equal(result.semantic, null);
  assert.equal(result.fallback.nextTier, 'internet');
});

test('generic route text does not resolve merely because PCA appears in context', () => {
  const result = resolveSemanticSelection({ text: '128D route', context: 'The PCA 128D route is selected.', elementType: 'figure-region' });
  assert.equal(result.status, 'unresolved');
});

test('whitelisted figure semantic hint resolves the intended chart region', () => {
  const result = resolveSemanticSelection({
    text: '128D route',
    context: 'Study 0 corrected UCB route.',
    elementType: 'figure-region',
    semanticHint: 'study0.route.1'
  });
  assert.equal(result.status, 'resolved');
  assert.equal(result.semantic.conceptId, 'pca');
  assert.equal(result.semantic.matchKind, 'semantic-hint');
});

test('returns an explicit internet fallback for unknown selections', () => {
  const result = resolveSemanticSelection({ text: 'completely unknown term' });
  assert.equal(result.status, 'unresolved');
  assert.equal(result.fallback.required, true);
  assert.equal(result.fallback.nextTier, 'internet');
  assert.match(result.fallback.webSearchUrl, /^https:\/\/www\.google\.com\/search\?q=/);
});

test('renders bounded intuition and detail without changing provenance', () => {
  const resolution = resolveSemanticSelection({ text: 'FNMR' });
  const intuition = renderBoundedExplanation(resolution, 'intuition');
  const detail = renderBoundedExplanation(resolution, 'detail');
  assert.equal(intuition.source.tier, 'diderot');
  assert.equal(detail.source.tier, 'diderot');
  assert.notEqual(intuition.text, detail.text);
  assert.equal(detail.claimId, 'C-NI-001');
});

test('semantic manifest declares the implemented resolver priority and context policy', () => {
  const manifest = semanticManifest();
  assert.deepEqual(manifest.resolverPriority, ['diderot', 'internet-fallback']);
  assert.equal(manifest.contextPolicy, 'disambiguation-only');
  assert.ok(manifest.concepts.some((concept) => concept.conceptId === 'pca'));
  assert.equal(getDiderotConcept('missing'), null);
});
