const SCOPE = { name: 'interactive-evidence-presenter.browser', version: '0.1.0' };
const RESOURCE = { attributes: [{ key: 'service.name', value: { stringValue: 'interactive-evidence-presenter.browser' } }] };

function context() {
  const value = globalThis.__E2E_TRACE_CONTEXT__;
  if (!value) return null;
  if (!/^[0-9a-f]{32}$/.test(value.traceId ?? '')) return null;
  if (!/^[0-9a-f]{16}$/.test(value.rootSpanId ?? '')) return null;
  return value;
}

function nowNs() {
  const ms = performance.timeOrigin + performance.now();
  return String(BigInt(Math.round(ms * 1_000_000)));
}

function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function otlpValue(value) {
  if (typeof value === 'boolean') return { boolValue: value };
  if (Number.isInteger(value)) return { intValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  return { stringValue: String(value) };
}

function attrs(values = {}) {
  return Object.entries(values).map(([key, value]) => ({ key, value: otlpValue(value) }));
}

function tracePayload(span) {
  return { resourceSpans: [{ resource: RESOURCE, scopeSpans: [{ scope: SCOPE, spans: [span] }] }] };
}

function logPayload(record) {
  return { resourceLogs: [{ resource: RESOURCE, scopeLogs: [{ scope: SCOPE, logRecords: [record] }] }] };
}

function histogramPayload(name, valueSeconds, traceId, spanId, attributes, startTimeUnixNano, endTimeUnixNano) {
  const bounds = [0.01, 0.1, 1];
  const counts = [0, 0, 0, 0];
  const index = bounds.findIndex((bound) => valueSeconds <= bound);
  counts[index === -1 ? counts.length - 1 : index] = 1;
  return {
    resourceMetrics: [{
      resource: RESOURCE,
      scopeMetrics: [{
        scope: SCOPE,
        metrics: [{
          name,
          description: 'Duration of one evidence-presenter interaction.',
          unit: 's',
          histogram: {
            aggregationTemporality: 1,
            dataPoints: [{
              attributes: attrs(attributes),
              startTimeUnixNano,
              timeUnixNano: endTimeUnixNano,
              count: '1',
              sum: valueSeconds,
              bucketCounts: counts.map(String),
              explicitBounds: bounds,
              exemplars: [{ timeUnixNano: endTimeUnixNano, asDouble: valueSeconds, traceId, spanId }]
            }]
          }
        }]
      }]
    }]
  };
}

function send(path, payload) {
  const promise = fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).then((response) => {
    if (!response.ok) throw new Error(`telemetry ${path} failed: ${response.status}`);
  });
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
  return promise;
}

const pending = new Set();

export function createTelemetry() {
  const ctx = context();
  globalThis.__IEP_TELEMETRY_FLUSH__ = async () => Promise.allSettled([...pending]);

  if (!ctx) {
    return { enabled: false, startSpan: () => ({ spanId: null, end: () => undefined }) };
  }

  return {
    enabled: true,
    startSpan(name, attributes = {}, parentSpanId = ctx.rootSpanId) {
      const spanId = randomHex(8);
      const startTimeUnixNano = nowNs();
      const startMs = performance.now();
      let ended = false;

      return {
        spanId,
        end({ eventName, eventBody, metric = true, statusCode = 1, extraAttributes = {} } = {}) {
          if (ended) return spanId;
          ended = true;
          const endTimeUnixNano = nowNs();
          const durationSeconds = Math.max(0, performance.now() - startMs) / 1000;
          const merged = { ...attributes, ...extraAttributes, 'iep.operation.duration_ms': durationSeconds * 1000 };

          const span = {
            traceId: ctx.traceId,
            spanId,
            parentSpanId,
            name,
            kind: 1,
            startTimeUnixNano,
            endTimeUnixNano,
            attributes: attrs(merged),
            status: { code: statusCode }
          };
          send('/v1/traces', tracePayload(span));

          if (eventName) {
            send('/v1/logs', logPayload({
              timeUnixNano: endTimeUnixNano,
              observedTimeUnixNano: endTimeUnixNano,
              severityNumber: 9,
              severityText: 'INFO',
              body: { stringValue: eventBody ?? eventName },
              eventName,
              attributes: attrs(attributes),
              traceId: ctx.traceId,
              spanId
            }));
          }

          if (metric) {
            send('/v1/metrics', histogramPayload(
              'iep.interaction.duration',
              durationSeconds,
              ctx.traceId,
              spanId,
              { 'iep.operation': name },
              startTimeUnixNano,
              endTimeUnixNano
            ));
          }
          return spanId;
        }
      };
    }
  };
}
