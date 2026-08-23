export const STUDY = Object.freeze({
  id: 'study-0',
  title: 'Study 0 — 512D → 128D embedding compression',
  claim: 'C-NI-001',
  claimStatus: 'NOT_DEMONSTRATED',
  statement: 'The corrected Study 0 reanalysis did not demonstrate non-inferiority of the tested 128D routes to raw 512D at empirical FMR 0.01.',
  nonInferiorityMargin: 0.03,
  ucb: Object.freeze([
    { route: 'Random 128D', low: 0.112649, high: 0.151768 },
    { route: 'PCA 128D', low: 0.125556, high: 0.133606 },
    { route: 'Siamese 128D', low: 0.176584, high: 0.189156 }
  ]),
  source: 'https://github.com/gharbonnier78/siamese-embedding-compression-lab/blob/main/STUDY0_FINAL_REPORT.md'
});

export const SLIDES = Object.freeze([
  { id: 'mission', eyebrow: 'Interactive evidence surface', title: 'A presentation that knows what is on screen', body: 'Click concepts, ask Emma, use voice navigation, or enable on-device gestures. Evidence remains distinct from generated explanation.' },
  { id: 'study-0', eyebrow: 'Evidence · Study 0', title: 'Compression did not demonstrate non-inferiority', body: 'The 97.5% upper confidence bound for ΔFNMR remains above the frozen 0.03 non-inferiority margin for every tested 128D route.' },
  { id: 'math', eyebrow: 'Pedagogical descent', title: 'From conclusion → metric → uncertainty → method', body: 'Select a concept to move from plain-language meaning to the mathematical object and then back to the experiment that uses it.' }
]);

export const CONCEPTS = Object.freeze({
  pca: { title: 'PCA', short: 'An unsupervised linear projection that keeps directions of greatest variance.', deep: 'PCA is a strong control here because it adapts to the source embedding distribution without using genuine/impostor labels. Its objective is variance preservation, not biometric low-FMR separation.' },
  fnmr: { title: 'FNMR', short: 'False Non-Match Rate: genuine comparisons incorrectly rejected.', deep: 'Study 0 compares ΔFNMR(candidate − raw) at an empirical FMR of 0.01. Lower is better when FMR is held at the comparison operating point.' },
  ucb: { title: '97.5% UCB', short: 'An upper confidence bound used for the one-sided non-inferiority decision.', deep: 'Non-inferiority requires the 97.5% upper bound of ΔFNMR to be ≤ 0.03 for every predeclared seed. A point estimate alone is insufficient.' },
  bootstrap: { title: 'Subject-slot bootstrap', short: 'Uncertainty is resampled at the subject level rather than pretending repeated pair observations are independent.', deep: 'The corrected method resamples subject slots on the observed LFW pair graph and reweights observed genuine and impostor edges without synthesizing unobserved pairs.' },
  siamese: { title: 'Siamese projection', short: 'Two training branches share one 512→128 projection and use pair supervision to reshape geometry.', deep: 'The two branches share weights. At inference, a single embedding passes through one projection; verification compares the resulting 128D templates.' }
});

export function parseCommand(input) {
  const value = String(input ?? '').trim().toLowerCase();
  if (!value) return { type: 'noop' };
  if (/\b(next|suivant|suivante|prochaine?)\b/.test(value)) return { type: 'next' };
  if (/\b(previous|prev|précédent|precedent|précédente|retour)\b/.test(value)) return { type: 'previous' };
  if (/study\s*0|étude\s*0|etude\s*0|experiment(?:ation)?\s*0/.test(value)) return { type: 'show', id: 'study-0' };
  for (const id of Object.keys(CONCEPTS)) {
    if (value.includes(id) || value.includes(CONCEPTS[id].title.toLowerCase())) return { type: 'concept', id };
  }
  if (value.includes('non-inf') || value.includes('claim') || value.includes('conclusion')) return { type: 'claim' };
  return { type: 'ask', query: value };
}

export function boundedAnswer(command) {
  if (command.type === 'claim') return STUDY.statement + ' This is failure to demonstrate non-inferiority, not proof of inferiority.';
  if (command.type === 'concept' && CONCEPTS[command.id]) return CONCEPTS[command.id].deep;
  if (command.type === 'ask') return 'This MVP only answers from its bundled evidence model. Try “Study 0”, “PCA”, “FNMR”, “bootstrap”, “UCB”, or “next slide”.';
  return '';
}
