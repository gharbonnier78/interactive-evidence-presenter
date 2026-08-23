import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import contract from './contracts/E2E-REFERENCE-001.json' with { type: 'json' };
import scenario from './scenarios/E2E-REFERENCE-001.json' with { type: 'json' };
import semanticContract from './contracts/E2E-SEMANTIC-002.json' with { type: 'json' };
import semanticScenario from './scenarios/E2E-SEMANTIC-002.json' with { type: 'json' };
import unknownContract from './contracts/E2E-SEMANTIC-UNKNOWN-003.json' with { type: 'json' };
import unknownScenario from './scenarios/E2E-SEMANTIC-UNKNOWN-003.json' with { type: 'json' };
import figureContract from './contracts/E2E-FIGURE-004.json' with { type: 'json' };
import figureScenario from './scenarios/E2E-FIGURE-004.json' with { type: 'json' };
import { makeTraceId, makeSpanId, nowNs, rootSpanEnvelope, validateTelemetry, pollEvidence } from './telemetry-evidence.mjs';

function comparisonText(validation) {
  const rows = validation.checks.map((check) => {
    const expected = JSON.stringify(check.expected);
    const actual = JSON.stringify(check.actual);
    return `${check.status.padEnd(4)} | ${check.kind.padEnd(16)} | ${check.selector}\n       expected=${expected}\n       actual  =${actual}`;
  });
  return [
    `Telemetry contract: ${validation.contract}`,
    `Status: ${validation.status}`,
    `Entry SpanId: ${validation.entrySpanId}`,
    `TraceId: ${validation.traceId}`,
    `Checks: ${validation.summary.passed}/${validation.summary.checks} passed`,
    '',
    ...rows
  ].join('\n');
}

function check(label, expected, actual, pass) {
  return { label, expected, actual, status: pass ? 'PASS' : 'FAIL' };
}

function stepResult(definition, actual, checks, screenshot = null) {
  return {
    id: definition.id,
    title: definition.title,
    action: definition.action,
    expected: definition.expected,
    actual,
    checks,
    screenshot,
    status: checks.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL'
  };
}

async function persistScenarioEvidence({ evidenceDir, result, bundle, validation, comparison, testInfo }) {
  await writeFile(join(evidenceDir, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile(join(evidenceDir, 'otel-evidence-bundle.json'), JSON.stringify(bundle, null, 2));
  await writeFile(join(evidenceDir, 'otel-validation.json'), JSON.stringify(validation, null, 2));
  await writeFile(join(evidenceDir, 'otel-expected-vs-actual.txt'), comparison);

  console.log(`\n${comparison}\n`);
  await testInfo.attach('uat-scenario-result.json', { path: join(evidenceDir, 'result.json'), contentType: 'application/json' });
  await testInfo.attach('otel-evidence-bundle.json', { path: join(evidenceDir, 'otel-evidence-bundle.json'), contentType: 'application/json' });
  await testInfo.attach('otel-validation.json', { path: join(evidenceDir, 'otel-validation.json'), contentType: 'application/json' });
  await testInfo.attach('otel-expected-vs-actual.txt', { path: join(evidenceDir, 'otel-expected-vs-actual.txt'), contentType: 'text/plain' });
}

async function prepareTracedPage({ page, request, traceId, rootSpanId }) {
  const reset = await request.post('/api/evidence/v1/reset');
  expect(reset.ok()).toBeTruthy();
  await page.addInitScript(({ traceId: injectedTraceId, rootSpanId: injectedRootSpanId }) => {
    globalThis.__E2E_TRACE_CONTEXT__ = { traceId: injectedTraceId, rootSpanId: injectedRootSpanId };
  }, { traceId, rootSpanId });
  await page.setExtraHTTPHeaders({ traceparent: `00-${traceId}-${rootSpanId}-01` });
  await page.goto('/');
}

async function finalizeSemanticScenario({ page, request, testInfo, scenarioDefinition, contractDefinition, traceId, rootSpanId, rootStart, evidenceDir, steps }) {
  await page.evaluate(async () => globalThis.__IEP_TELEMETRY_FLUSH__?.());
  const rootEnd = nowNs();
  const rootResponse = await request.post('/v1/traces', {
    headers: { 'content-type': 'application/json' },
    data: rootSpanEnvelope({
      traceId,
      rootSpanId,
      startTimeUnixNano: rootStart,
      endTimeUnixNano: rootEnd,
      testId: contractDefinition.testId,
      rootName: contractDefinition.root.name
    })
  });
  expect(rootResponse.ok()).toBeTruthy();

  const bundle = await pollEvidence(request, rootSpanId, 1 + contractDefinition.spans.length);
  const validation = validateTelemetry(bundle, contractDefinition);
  const comparison = comparisonText(validation);
  const telemetryStep = scenarioDefinition.steps.at(-1);
  steps.push(stepResult(telemetryStep, {
    entrySpanId: validation.entrySpanId,
    traceId: validation.traceId,
    telemetrySummary: validation.summary,
    bundleSummary: bundle.summary,
    validatorStatus: validation.status
  }, [
    check('Telemetry contract', 'PASS', validation.status, validation.status === 'PASS'),
    check('Expected span count', 1 + contractDefinition.spans.length, bundle.summary.spanCount, bundle.summary.spanCount === 1 + contractDefinition.spans.length),
    check('Error logs', 0, validation.checks.find((item) => item.kind === 'error-logs')?.actual, validation.checks.find((item) => item.kind === 'error-logs')?.status === 'PASS')
  ]));

  const result = {
    schemaVersion: '1.0',
    scenario: scenarioDefinition,
    execution: {
      framework: 'Playwright',
      project: testInfo.project.name,
      targetCommit: process.env.GITHUB_SHA ?? 'local',
      startedAtUnixNano: rootStart,
      endedAtUnixNano: rootEnd,
      traceId,
      rootSpanId
    },
    verdict: steps.every((step) => step.status === 'PASS') && validation.status === 'PASS' ? 'PASS' : 'FAIL',
    steps,
    telemetry: { contract: contractDefinition, validation, bundle }
  };

  await persistScenarioEvidence({ evidenceDir, result, bundle, validation, comparison, testInfo });
  expect(result.verdict, JSON.stringify(steps.filter((step) => step.status === 'FAIL'), null, 2)).toBe('PASS');
  expect(validation.status, comparison).toBe('PASS');
}

test('reference evidence navigation remains grounded and telemetry-complete', async ({ page, request }, testInfo) => {
  const traceId = makeTraceId();
  const rootSpanId = makeSpanId();
  const rootStart = nowNs();
  const evidenceDir = join('test-results', 'uat-evidence', scenario.id);
  await mkdir(evidenceDir, { recursive: true });
  const steps = [];

  await prepareTracedPage({ page, request, traceId, rootSpanId });

  const title = await page.title();
  const evidenceText = await page.locator('#evidence-copy').innerText();
  const shot1 = join(evidenceDir, scenario.steps[0].screenshot);
  await page.screenshot({ path: shot1, fullPage: true });
  await testInfo.attach('UAT S1 - Open presenter', { path: shot1, contentType: 'image/png' });
  steps.push(stepResult(scenario.steps[0], { pageTitle: title, evidenceText }, [
    check('Application title', 'Interactive Evidence Presenter', title, /Interactive Evidence Presenter/.test(title)),
    check('Claim status', 'C-NI-001: NOT_DEMONSTRATED', evidenceText, evidenceText.includes('C-NI-001: NOT_DEMONSTRATED')),
    check('Inferential wording', 'did not demonstrate non-inferiority', evidenceText, evidenceText.includes('did not demonstrate non-inferiority'))
  ], scenario.steps[0].screenshot));

  await page.getByRole('button', { name: /Next/ }).click();
  const heading = await page.getByRole('heading', { level: 1 }).innerText();
  const shot2 = join(evidenceDir, scenario.steps[1].screenshot);
  await page.screenshot({ path: shot2, fullPage: true });
  await testInfo.attach('UAT S2 - Study 0', { path: shot2, contentType: 'image/png' });
  steps.push(stepResult(scenario.steps[1], { heading, expectedTelemetry: 'iep.slide.navigate mission -> study-0 action=next' }, [
    check('Study 0 heading', 'Compression did not demonstrate non-inferiority', heading, heading.includes('Compression did not demonstrate non-inferiority'))
  ], scenario.steps[1].screenshot));

  await page.getByRole('button', { name: 'PCA' }).click();
  const conceptTitle = await page.locator('#concept-title').innerText();
  const emmaText = await page.locator('#emma-copy').innerText();
  const shot3 = join(evidenceDir, scenario.steps[2].screenshot);
  await page.screenshot({ path: shot3, fullPage: true });
  await testInfo.attach('UAT S3 - PCA concept', { path: shot3, contentType: 'image/png' });
  steps.push(stepResult(scenario.steps[2], { conceptTitle, emmaText, expectedClaimLink: 'C-NI-001' }, [
    check('Concept title', 'PCA', conceptTitle, conceptTitle === 'PCA'),
    check('Emma PCA wording', 'unsupervised linear projection', emmaText, emmaText.includes('unsupervised linear projection'))
  ], scenario.steps[2].screenshot));

  await page.evaluate(async () => globalThis.__IEP_TELEMETRY_FLUSH__?.());
  const rootEnd = nowNs();
  const rootResponse = await request.post('/v1/traces', {
    headers: { 'content-type': 'application/json' },
    data: rootSpanEnvelope({ traceId, rootSpanId, startTimeUnixNano: rootStart, endTimeUnixNano: rootEnd, testId: contract.testId })
  });
  expect(rootResponse.ok()).toBeTruthy();

  const bundle = await pollEvidence(request, rootSpanId, 1 + contract.spans.length);
  const validation = validateTelemetry(bundle, contract);
  const comparison = comparisonText(validation);
  const telemetryStep = scenario.steps[3];
  steps.push(stepResult(telemetryStep, {
    entrySpanId: validation.entrySpanId,
    traceId: validation.traceId,
    telemetrySummary: validation.summary,
    bundleSummary: bundle.summary,
    validatorStatus: validation.status
  }, [
    check('Telemetry contract', 'PASS', validation.status, validation.status === 'PASS'),
    check('Expected span count', 1 + contract.spans.length, bundle.summary.spanCount, bundle.summary.spanCount === 1 + contract.spans.length),
    check('Error logs', 0, validation.checks.find((item) => item.kind === 'error-logs')?.actual, validation.checks.find((item) => item.kind === 'error-logs')?.status === 'PASS')
  ]));

  const result = {
    schemaVersion: '1.0',
    scenario,
    execution: {
      framework: 'Playwright', project: testInfo.project.name, targetCommit: process.env.GITHUB_SHA ?? 'local',
      startedAtUnixNano: rootStart, endedAtUnixNano: rootEnd, traceId, rootSpanId
    },
    verdict: steps.every((step) => step.status === 'PASS') && validation.status === 'PASS' ? 'PASS' : 'FAIL',
    steps,
    telemetry: { contract, validation, bundle }
  };

  await persistScenarioEvidence({ evidenceDir, result, bundle, validation, comparison, testInfo });
  expect(result.verdict, JSON.stringify(steps.filter((step) => step.status === 'FAIL'), null, 2)).toBe('PASS');
  expect(validation.status, comparison).toBe('PASS');
});

test('known semantic text selection resolves Diderot-first and remains telemetry-complete', async ({ page, request }, testInfo) => {
  const traceId = makeTraceId();
  const rootSpanId = makeSpanId();
  const rootStart = nowNs();
  const evidenceDir = join('test-results', 'uat-evidence', semanticScenario.id);
  await mkdir(evidenceDir, { recursive: true });
  const steps = [];
  await prepareTracedPage({ page, request, traceId, rootSpanId });

  await page.evaluate(() => {
    const button = document.querySelector('[data-concept="pca"]');
    if (!button) throw new Error('PCA text target missing');
    const range = document.createRange();
    range.selectNodeContents(button);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  await expect(page.locator('#selection-text')).toContainText('Selected: “PCA”');
  await expect(page.locator('#selection-source')).toContainText('Diderot · api');
  await expect(page.locator('#concept-title')).toHaveText('PCA');
  await expect(page.locator('#concept-copy')).toContainText('unsupervised linear projection');
  await expect(page.locator('#external-fallback')).toBeHidden();

  const selectedLabel = await page.locator('#selection-text').innerText();
  const sourceLabel = await page.locator('#selection-source').innerText();
  const semanticTitle = await page.locator('#concept-title').innerText();
  const explanationText = await page.locator('#concept-copy').innerText();
  const shot1 = join(evidenceDir, semanticScenario.steps[0].screenshot);
  await page.screenshot({ path: shot1, fullPage: true });
  await testInfo.attach('UAT UC-002A S1 - Semantic PCA selection', { path: shot1, contentType: 'image/png' });
  steps.push(stepResult(semanticScenario.steps[0], { selectedLabel, sourceLabel, semanticTitle, explanationText, externalFallbackVisible: false }, [
    check('Selected text', 'Selected: “PCA”', selectedLabel, selectedLabel.includes('Selected: “PCA”')),
    check('Resolver priority', 'Diderot · api', sourceLabel, sourceLabel.includes('Diderot · api')),
    check('Semantic title', 'PCA', semanticTitle, semanticTitle === 'PCA'),
    check('Bounded intuition', 'unsupervised linear projection', explanationText, explanationText.includes('unsupervised linear projection')),
    check('Internet fallback hidden', false, false, true)
  ], semanticScenario.steps[0].screenshot));

  const apiResponse = await request.post('/api/semantic/v1/resolve', {
    headers: { 'content-type': 'application/json' },
    data: { text: 'PCA', context: 'Study 0 PCA 128D route', slideId: 'mission', elementType: 'text' }
  });
  expect(apiResponse.ok()).toBeTruthy();
  const apiBody = await apiResponse.json();
  steps.push(stepResult(semanticScenario.steps[1], {
    status: apiBody.status, semanticId: apiBody.semantic?.id, sourceTier: apiBody.knowledge?.source?.tier, fallbackRequired: apiBody.fallback?.required
  }, [
    check('Resolution status', 'resolved', apiBody.status, apiBody.status === 'resolved'),
    check('Semantic id', 'concept:pca', apiBody.semantic?.id, apiBody.semantic?.id === 'concept:pca'),
    check('Knowledge source', 'diderot', apiBody.knowledge?.source?.tier, apiBody.knowledge?.source?.tier === 'diderot'),
    check('Fallback required', false, apiBody.fallback?.required, apiBody.fallback?.required === false)
  ]));

  await finalizeSemanticScenario({ page, request, testInfo, scenarioDefinition: semanticScenario, contractDefinition: semanticContract, traceId, rootSpanId, rootStart, evidenceDir, steps });
});

test('unknown text remains unresolved even when context contains PCA', async ({ page, request }, testInfo) => {
  const traceId = makeTraceId();
  const rootSpanId = makeSpanId();
  const rootStart = nowNs();
  const evidenceDir = join('test-results', 'uat-evidence', unknownScenario.id);
  await mkdir(evidenceDir, { recursive: true });
  const steps = [];
  await prepareTracedPage({ page, request, traceId, rootSpanId });

  await page.evaluate(() => {
    const heading = document.querySelector('#slide-title');
    const node = heading?.firstChild;
    const value = node?.textContent ?? '';
    const start = value.indexOf('presentation');
    if (!node || start < 0) throw new Error('presentation text target missing');
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 'presentation'.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    heading.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  await expect(page.locator('#selection-text')).toContainText('Selected: “presentation”');
  await expect(page.locator('#selection-source')).toHaveText('Internet fallback');
  await expect(page.locator('#concept-title')).toHaveText('presentation');
  await expect(page.locator('#external-fallback')).toBeVisible();
  await expect(page.locator('#concept-title')).not.toHaveText('PCA');

  const selectedLabel = await page.locator('#selection-text').innerText();
  const sourceLabel = await page.locator('#selection-source').innerText();
  const semanticTitle = await page.locator('#concept-title').innerText();
  const shot1 = join(evidenceDir, unknownScenario.steps[0].screenshot);
  await page.screenshot({ path: shot1, fullPage: true });
  await testInfo.attach('UAT UC-002B S1 - Unknown selection', { path: shot1, contentType: 'image/png' });
  steps.push(stepResult(unknownScenario.steps[0], { selectedLabel, sourceLabel, semanticTitle, externalFallbackVisible: true }, [
    check('Selected text', 'Selected: “presentation”', selectedLabel, selectedLabel.includes('Selected: “presentation”')),
    check('No context-only PCA match', 'presentation', semanticTitle, semanticTitle === 'presentation'),
    check('Fallback source', 'Internet fallback', sourceLabel, sourceLabel === 'Internet fallback'),
    check('Search web visible', true, true, true)
  ], unknownScenario.steps[0].screenshot));

  const apiResponse = await request.post('/api/semantic/v1/resolve', {
    headers: { 'content-type': 'application/json' },
    data: { text: 'presentation', context: 'Nearby controls include PCA FNMR UCB Bootstrap Siamese.', slideId: 'mission', elementType: 'text' }
  });
  expect(apiResponse.ok()).toBeTruthy();
  const apiBody = await apiResponse.json();
  steps.push(stepResult(unknownScenario.steps[1], {
    status: apiBody.status, semantic: apiBody.semantic, nextTier: apiBody.fallback?.nextTier, fallbackRequired: apiBody.fallback?.required
  }, [
    check('Resolution status', 'unresolved', apiBody.status, apiBody.status === 'unresolved'),
    check('Semantic object', null, apiBody.semantic, apiBody.semantic === null),
    check('Fallback next tier', 'internet', apiBody.fallback?.nextTier, apiBody.fallback?.nextTier === 'internet'),
    check('Fallback required', true, apiBody.fallback?.required, apiBody.fallback?.required === true)
  ]));

  await finalizeSemanticScenario({ page, request, testInfo, scenarioDefinition: unknownScenario, contractDefinition: unknownContract, traceId, rootSpanId, rootStart, evidenceDir, steps });
});

test('PCA chart region resolves through the figure semantic path', async ({ page, request }, testInfo) => {
  const traceId = makeTraceId();
  const rootSpanId = makeSpanId();
  const rootStart = nowNs();
  const evidenceDir = join('test-results', 'uat-evidence', figureScenario.id);
  await mkdir(evidenceDir, { recursive: true });
  const steps = [];
  await prepareTracedPage({ page, request, traceId, rootSpanId });

  await page.locator('#result-chart').click({ position: { x: 160, y: 104 } });
  await expect(page.locator('#selection-text')).toContainText('Selected: “PCA 128D”');
  await expect(page.locator('#selection-source')).toContainText('Diderot · api');
  await expect(page.locator('#concept-title')).toHaveText('PCA');
  await expect(page.locator('#concept-copy')).toContainText('unsupervised linear projection');
  await expect(page.locator('#external-fallback')).toBeHidden();

  const selectedLabel = await page.locator('#selection-text').innerText();
  const sourceLabel = await page.locator('#selection-source').innerText();
  const semanticTitle = await page.locator('#concept-title').innerText();
  const explanationText = await page.locator('#concept-copy').innerText();
  const shot1 = join(evidenceDir, figureScenario.steps[0].screenshot);
  await page.screenshot({ path: shot1, fullPage: true });
  await testInfo.attach('UAT UC-002C S1 - PCA figure selection', { path: shot1, contentType: 'image/png' });
  steps.push(stepResult(figureScenario.steps[0], { selectedLabel, sourceLabel, semanticTitle, explanationText, externalFallbackVisible: false }, [
    check('Selected figure text', 'Selected: “PCA 128D”', selectedLabel, selectedLabel.includes('Selected: “PCA 128D”')),
    check('Resolver priority', 'Diderot · api', sourceLabel, sourceLabel.includes('Diderot · api')),
    check('Semantic title', 'PCA', semanticTitle, semanticTitle === 'PCA'),
    check('Bounded intuition', 'unsupervised linear projection', explanationText, explanationText.includes('unsupervised linear projection')),
    check('Internet fallback hidden', false, false, true)
  ], figureScenario.steps[0].screenshot));

  const apiResponse = await request.post('/api/semantic/v1/resolve', {
    headers: { 'content-type': 'application/json' },
    data: { text: '128D route', context: 'Study 0 corrected UCB route.', slideId: 'mission', elementType: 'figure-region', semanticHint: 'study0.route.1' }
  });
  expect(apiResponse.ok()).toBeTruthy();
  const apiBody = await apiResponse.json();
  steps.push(stepResult(figureScenario.steps[1], {
    status: apiBody.status, semanticId: apiBody.semantic?.id, matchKind: apiBody.semantic?.matchKind,
    sourceTier: apiBody.knowledge?.source?.tier, fallbackRequired: apiBody.fallback?.required
  }, [
    check('Resolution status', 'resolved', apiBody.status, apiBody.status === 'resolved'),
    check('Semantic id', 'concept:pca', apiBody.semantic?.id, apiBody.semantic?.id === 'concept:pca'),
    check('Match kind', 'semantic-hint', apiBody.semantic?.matchKind, apiBody.semantic?.matchKind === 'semantic-hint'),
    check('Knowledge source', 'diderot', apiBody.knowledge?.source?.tier, apiBody.knowledge?.source?.tier === 'diderot'),
    check('Fallback required', false, apiBody.fallback?.required, apiBody.fallback?.required === false)
  ]));

  await finalizeSemanticScenario({ page, request, testInfo, scenarioDefinition: figureScenario, contractDefinition: figureContract, traceId, rootSpanId, rootStart, evidenceDir, steps });
});

test('API failure is visible and never masquerades as static preview', async ({ page }) => {
  await page.route('**/api/explanations/v1/render', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'forced-review-failure' }) });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const button = document.querySelector('[data-concept="pca"]');
    const range = document.createRange();
    range.selectNodeContents(button);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await expect(page.locator('#selection-source')).toHaveText('API error');
  await expect(page.locator('#concept-title')).toHaveText('Resolver unavailable');
  await expect(page.locator('#selection-source')).not.toContainText('local-static-preview');
  await expect(page.locator('#external-fallback')).toBeHidden();
});

test('semantic POST APIs enforce content type, schema and payload bound', async ({ request }) => {
  const unsupported = await request.post('/api/semantic/v1/resolve', {
    headers: { 'content-type': 'text/plain' },
    data: JSON.stringify({ text: 'PCA' })
  });
  expect(unsupported.status()).toBe(415);

  const invalid = await request.post('/api/semantic/v1/resolve', {
    headers: { 'content-type': 'application/json' },
    data: { text: { not: 'a string' } }
  });
  expect(invalid.status()).toBe(400);

  const oversized = await request.post('/api/semantic/v1/resolve', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ text: 'x'.repeat(33_000) })
  });
  expect(oversized.status()).toBe(413);
});

test('Emma bounded commands preserve the inferential limit', async ({ page }) => {
  await page.goto('/');
  const command = page.locator('#command');
  await command.fill('conclusion');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.locator('#emma-copy')).toContainText('failure to demonstrate non-inferiority');
  await expect(page.locator('#emma-copy')).toContainText('not proof of inferiority');
  await command.fill('bootstrap');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.locator('#concept-title')).toHaveText('Subject-slot bootstrap');
});
