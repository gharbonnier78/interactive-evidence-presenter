import { test, expect } from '@playwright/test';
import contract from './contracts/E2E-REFERENCE-001.json' with { type: 'json' };
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

test('reference evidence navigation remains grounded and telemetry-complete', async ({ page, request }, testInfo) => {
  const traceId = makeTraceId();
  const rootSpanId = makeSpanId();
  const rootStart = nowNs();

  const reset = await request.post('/api/evidence/v1/reset');
  expect(reset.ok()).toBeTruthy();

  await page.addInitScript(({ traceId: injectedTraceId, rootSpanId: injectedRootSpanId }) => {
    globalThis.__E2E_TRACE_CONTEXT__ = { traceId: injectedTraceId, rootSpanId: injectedRootSpanId };
  }, { traceId, rootSpanId });
  await page.setExtraHTTPHeaders({ traceparent: `00-${traceId}-${rootSpanId}-01` });

  await page.goto('/');

  await expect(page).toHaveTitle(/Interactive Evidence Presenter/);
  await expect(page.locator('#evidence-copy')).toContainText('C-NI-001: NOT_DEMONSTRATED');
  await expect(page.locator('#evidence-copy')).toContainText('did not demonstrate non-inferiority');

  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Compression did not demonstrate non-inferiority');

  await page.getByRole('button', { name: 'PCA' }).click();
  await expect(page.locator('#concept-title')).toHaveText('PCA');
  await expect(page.locator('#emma-copy')).toContainText('unsupervised linear projection');

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

  console.log(`\n${comparison}\n`);
  await testInfo.attach('otel-evidence-bundle.json', { body: Buffer.from(JSON.stringify(bundle, null, 2)), contentType: 'application/json' });
  await testInfo.attach('otel-validation.json', { body: Buffer.from(JSON.stringify(validation, null, 2)), contentType: 'application/json' });
  await testInfo.attach('otel-expected-vs-actual.txt', { body: Buffer.from(comparison), contentType: 'text/plain' });

  expect(validation.status, comparison).toBe('PASS');
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
