function anyValueToJs(value = {}) {
  if ('stringValue' in value) return value.stringValue;
  if ('boolValue' in value) return value.boolValue;
  if ('intValue' in value) return Number(value.intValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('arrayValue' in value) return (value.arrayValue?.values ?? []).map(anyValueToJs);
  if ('kvlistValue' in value) return Object.fromEntries((value.kvlistValue?.values ?? []).map((item) => [item.key, anyValueToJs(item.value)]));
  return null;
}

function attributesToObject(attributes = []) {
  return Object.fromEntries(attributes.map((item) => [item.key, anyValueToJs(item.value)]));
}

function resourceAttributes(resource) {
  return attributesToObject(resource?.attributes ?? []);
}

function pointValue(type, point) {
  if (type === 'gauge' || type === 'sum') {
    if ('asDouble' in point) return Number(point.asDouble);
    if ('asInt' in point) return Number(point.asInt);
  }
  if (type === 'histogram') {
    const count = Number(point.count ?? 0);
    return count > 0 && point.sum !== undefined ? Number(point.sum) / count : null;
  }
  return null;
}

export class TelemetryStore {
  constructor() { this.reset(); }

  reset() {
    this.tracePayloads = [];
    this.logPayloads = [];
    this.metricPayloads = [];
    this.spans = [];
    this.logs = [];
    this.metrics = [];
  }

  ingestTraces(payload) {
    this.tracePayloads.push(payload);
    for (const resourceSpans of payload?.resourceSpans ?? []) {
      const resource = resourceAttributes(resourceSpans.resource);
      for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
        const scope = scopeSpans.scope ?? {};
        for (const span of scopeSpans.spans ?? []) {
          this.spans.push({
            ...span,
            attributesObject: attributesToObject(span.attributes),
            resource,
            scope
          });
        }
      }
    }
  }

  ingestLogs(payload) {
    this.logPayloads.push(payload);
    for (const resourceLogs of payload?.resourceLogs ?? []) {
      const resource = resourceAttributes(resourceLogs.resource);
      for (const scopeLogs of resourceLogs.scopeLogs ?? []) {
        const scope = scopeLogs.scope ?? {};
        for (const record of scopeLogs.logRecords ?? []) {
          this.logs.push({
            ...record,
            bodyValue: anyValueToJs(record.body),
            attributesObject: attributesToObject(record.attributes),
            resource,
            scope
          });
        }
      }
    }
  }

  ingestMetrics(payload) {
    this.metricPayloads.push(payload);
    const dataTypes = ['gauge', 'sum', 'histogram', 'exponentialHistogram', 'summary'];
    for (const resourceMetrics of payload?.resourceMetrics ?? []) {
      const resource = resourceAttributes(resourceMetrics.resource);
      for (const scopeMetrics of resourceMetrics.scopeMetrics ?? []) {
        const scope = scopeMetrics.scope ?? {};
        for (const metric of scopeMetrics.metrics ?? []) {
          for (const type of dataTypes) {
            const container = metric[type];
            if (!container?.dataPoints) continue;
            for (const point of container.dataPoints) {
              this.metrics.push({
                name: metric.name,
                description: metric.description ?? '',
                unit: metric.unit ?? '',
                type,
                aggregationTemporality: container.aggregationTemporality,
                point,
                value: pointValue(type, point),
                attributesObject: attributesToObject(point.attributes),
                exemplars: point.exemplars ?? [],
                resource,
                scope
              });
            }
          }
        }
      }
    }
  }

  getSpanBundle(spanId) {
    const entry = this.spans.find((span) => span.spanId === spanId);
    if (!entry) return null;

    const traceId = entry.traceId;
    const ids = new Set([spanId]);
    const queue = [spanId];
    while (queue.length) {
      const parent = queue.shift();
      for (const span of this.spans) {
        if (span.traceId === traceId && span.parentSpanId === parent && !ids.has(span.spanId)) {
          ids.add(span.spanId);
          queue.push(span.spanId);
        }
      }
    }

    const spans = this.spans
      .filter((span) => span.traceId === traceId && ids.has(span.spanId))
      .sort((a, b) => String(a.startTimeUnixNano).localeCompare(String(b.startTimeUnixNano)));
    const logs = this.logs.filter((record) => record.traceId === traceId && ids.has(record.spanId));
    const metrics = this.metrics.filter((metric) => metric.exemplars.some((exemplar) => exemplar.traceId === traceId && ids.has(exemplar.spanId)));

    return {
      entrySpanId: spanId,
      traceId,
      entrySpan: entry,
      summary: {
        spanCount: spans.length,
        descendantCount: Math.max(0, spans.length - 1),
        logCount: logs.length,
        metricPointCount: metrics.length
      },
      spans,
      logs,
      metrics,
      raw: {
        traces: this.tracePayloads,
        logs: this.logPayloads,
        metrics: this.metricPayloads
      }
    };
  }

  getTraceBundle(traceId) {
    const root = this.spans.find((span) => span.traceId === traceId && !span.parentSpanId) ?? this.spans.find((span) => span.traceId === traceId);
    return root ? this.getSpanBundle(root.spanId) : null;
  }
}
