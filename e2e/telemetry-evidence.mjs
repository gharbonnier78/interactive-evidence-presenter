import { randomBytes } from 'node:crypto';

export function makeTraceId() { return randomBytes(16).toString('hex'); }
export function makeSpanId() { return randomBytes(8).toString('hex'); }
export function nowNs() { return String(BigInt(Date.now()) * 1_000_000n); }

function otlpValue(value) {
  if (typeof value === 'boolean') return { boolValue: value };
  if (Number.isInteger(value)) return { intValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  return { stringValue: String(value) };
}

function attrs(values) {
  return Object.entries(values).map(([key, value]) => ({ key, value: otlpValue(value) }));
}

export function rootSpanEnvelope({ traceId, rootSpanId, startTimeUnixNano, endTimeUnixNano, testId }) {
  return {
    resourceSpans: [{
      resource: { attributes: attrs({ 'service.name': 'playwright.reference-test' }) },
      scopeSpans: [{
        scope: { name: 'interactive-evidence-presenter.e2e', version: '0.1.0' },
        spans: [{
          traceId,
          spanId: rootSpanId,
          name: 'test.e2e.reference_evidence_navigation',
          kind: 1,
          startTimeUnixNano,
          endTimeUnixNano,
          attributes: attrs({ 'test.framework': 'playwright', 'test.id': testId }),
          status: { code: 1 }
        }]
      }]
    }]
  };
}

function checkAttributes(actual = {}, expected = {}) {
  return Object.entries(expected).map(([key, value]) => ({
    key,
    expected: value,
    actual: actual[key],
    status: Object.is(actual[key], value) ? 'PASS' : 'FAIL'
  }));
}

function result(kind, selector, expected, actual, status) {
  return { kind, selector, expected, actual, status };
}

export function validateTelemetry(bundle, contract) {
  const checks = [];
  const root = bundle.spans.find((span) => span.spanId === bundle.entrySpanId);
  checks.push(result('root-span', contract.root.name, contract.root.name, root?.name, root?.name === contract.root.name ? 'PASS' : 'FAIL'));

  for (const attr of checkAttributes(root?.attributesObject, contract.root.attributes)) {
    checks.push(result('root-attribute', attr.key, attr.expected, attr.actual, attr.status));
  }

  const spanByName = new Map();
  for (const expected of contract.spans) {
    const matches = bundle.spans.filter((span) => span.name === expected.name);
    const actual = matches[0];
    if (actual) spanByName.set(expected.name, actual);
    checks.push(result('span-cardinality', expected.name, 1, matches.length, matches.length === 1 ? 'PASS' : 'FAIL'));
    if (!actual) continue;

    const expectedParent = expected.parent === '$root' ? bundle.entrySpanId : spanByName.get(expected.parent)?.spanId;
    checks.push(result('span-parent', expected.name, expectedParent, actual.parentSpanId, actual.parentSpanId === expectedParent ? 'PASS' : 'FAIL'));
    if (expected.kind !== undefined) {
      checks.push(result('span-kind', expected.name, expected.kind, actual.kind, actual.kind === expected.kind ? 'PASS' : 'FAIL'));
    }
    for (const attr of checkAttributes(actual.attributesObject, expected.attributes)) {
      checks.push(result('span-attribute', `${expected.name}:${attr.key}`, attr.expected, attr.actual, attr.status));
    }
  }

  if (!contract.allowUnexpectedSpans) {
    const allowed = new Set([contract.root.name, ...contract.spans.map((span) => span.name)]);
    const unexpected = bundle.spans.filter((span) => !allowed.has(span.name)).map((span) => span.name);
    checks.push(result('unexpected-spans', 'subtree', [], unexpected, unexpected.length === 0 ? 'PASS' : 'FAIL'));
  }

  for (const expected of contract.logs) {
    const span = spanByName.get(expected.span);
    const matches = bundle.logs.filter((record) => record.eventName === expected.eventName && record.spanId === span?.spanId);
    checks.push(result('log', expected.eventName, { span: expected.span, severityNumber: expected.severityNumber }, matches.map((record) => ({ spanId: record.spanId, severityNumber: record.severityNumber })), matches.length === 1 && matches[0].severityNumber === expected.severityNumber ? 'PASS' : 'FAIL'));
  }

  const forbiddenLogs = bundle.logs.filter((record) => Number(record.severityNumber ?? 0) >= contract.forbidLogsAtOrAboveSeverity);
  checks.push(result('error-logs', `severity>=${contract.forbidLogsAtOrAboveSeverity}`, 0, forbiddenLogs.length, forbiddenLogs.length === 0 ? 'PASS' : 'FAIL'));

  for (const expected of contract.metrics) {
    const span = spanByName.get(expected.span);
    const matches = bundle.metrics.filter((metric) => metric.name === expected.name && metric.unit === expected.unit && metric.exemplars.some((exemplar) => exemplar.traceId === bundle.traceId && exemplar.spanId === span?.spanId));
    const withinLimit = matches.length === 1 && typeof matches[0].value === 'number' && matches[0].value <= expected.max;
    checks.push(result('metric', `${expected.name}@${expected.span}`, { unit: expected.unit, max: expected.max, correlatedExemplar: true }, matches.map((metric) => ({ unit: metric.unit, value: metric.value, exemplars: metric.exemplars })), withinLimit ? 'PASS' : 'FAIL'));
  }

  const failed = checks.filter((check) => check.status === 'FAIL');
  return {
    contract: contract.testId,
    entrySpanId: bundle.entrySpanId,
    traceId: bundle.traceId,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    summary: { checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
    checks
  };
}

export async function pollEvidence(request, rootSpanId, expectedSpanCount, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const response = await request.get(`/api/evidence/v1/spans/${rootSpanId}`);
    if (response.ok()) {
      last = await response.json();
      if ((last.summary?.spanCount ?? 0) >= expectedSpanCount) return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`telemetry evidence incomplete for ${rootSpanId}; last=${JSON.stringify(last?.summary ?? null)}`);
}
