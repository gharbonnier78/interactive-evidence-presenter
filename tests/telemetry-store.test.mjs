import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryStore } from '../telemetry-store.mjs';

const attr = (key, stringValue) => ({ key, value: { stringValue } });

test('TelemetryStore reconstructs a span subtree with correlated logs and metric exemplars', () => {
  const store = new TelemetryStore();
  const traceId = '11111111111111111111111111111111';
  const rootSpanId = '2222222222222222';
  const childSpanId = '3333333333333333';

  store.ingestTraces({ resourceSpans: [{ resource: {}, scopeSpans: [{ scope: {}, spans: [
    { traceId, spanId: rootSpanId, name: 'root', startTimeUnixNano: '1', endTimeUnixNano: '5', attributes: [] },
    { traceId, spanId: childSpanId, parentSpanId: rootSpanId, name: 'child', startTimeUnixNano: '2', endTimeUnixNano: '4', attributes: [attr('iep.test', 'yes')] }
  ] }] }] });

  store.ingestLogs({ resourceLogs: [{ resource: {}, scopeLogs: [{ scope: {}, logRecords: [
    { traceId, spanId: childSpanId, eventName: 'iep.child.done', severityNumber: 9, body: { stringValue: 'done' }, attributes: [] }
  ] }] }] });

  store.ingestMetrics({ resourceMetrics: [{ resource: {}, scopeMetrics: [{ scope: {}, metrics: [{
    name: 'iep.interaction.duration', unit: 's', histogram: { aggregationTemporality: 1, dataPoints: [{
      count: '1', sum: 0.02, attributes: [], exemplars: [{ traceId, spanId: childSpanId, asDouble: 0.02, timeUnixNano: '4' }]
    }] }
  }] }] }] });

  const bundle = store.getSpanBundle(rootSpanId);
  assert.equal(bundle.traceId, traceId);
  assert.equal(bundle.summary.spanCount, 2);
  assert.equal(bundle.summary.logCount, 1);
  assert.equal(bundle.summary.metricPointCount, 1);
  assert.equal(bundle.spans[1].attributesObject['iep.test'], 'yes');
  assert.equal(bundle.logs[0].eventName, 'iep.child.done');
  assert.equal(bundle.metrics[0].value, 0.02);
});
