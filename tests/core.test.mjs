import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, boundedAnswer, STUDY } from '../app/core.mjs';

test('navigation commands are bilingual and bounded', () => {
  assert.deepEqual(parseCommand('next slide'), { type: 'next' });
  assert.deepEqual(parseCommand('slide précédente'), { type: 'previous' });
});

test('study command resolves to the evidence slide', () => {
  assert.deepEqual(parseCommand('Emma montre Study 0'), { type: 'show', id: 'study-0' });
});

test('concept command resolves known canonical concept', () => {
  assert.deepEqual(parseCommand('explique le bootstrap'), { type: 'concept', id: 'bootstrap' });
  assert.match(boundedAnswer({ type: 'concept', id: 'pca' }), /variance/i);
});

test('claim wording keeps non-inferiority inference bounded', () => {
  const answer = boundedAnswer({ type: 'claim' });
  assert.match(answer, /not proof of inferiority/i);
  assert.equal(STUDY.claimStatus, 'NOT_DEMONSTRATED');
});

test('unknown questions do not fabricate evidence', () => {
  assert.match(boundedAnswer(parseCommand('what is the moon made of?')), /only answers from its bundled evidence model/i);
});
