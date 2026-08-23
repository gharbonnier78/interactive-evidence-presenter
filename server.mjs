import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelemetryStore } from './telemetry-store.mjs';

const ROOT = resolve(fileURLToPath(new URL('./app/', import.meta.url)));
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const HOST = '0.0.0.0';
const EVIDENCE_TEST_MODE = process.env.EVIDENCE_TEST_MODE === '1';
const telemetryStore = new TelemetryStore();

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon']
]);

const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests"
].join('; ');

function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', 'no-store');
}

function safePath(urlPath) {
  const raw = decodeURIComponent(urlPath.split('?')[0]);
  const relative = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
  const candidate = resolve(ROOT, normalize(relative));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  return candidate;
}

function nowNs() {
  return String(BigInt(Date.now()) * 1_000_000n);
}

function otlpValue(value) {
  if (typeof value === 'boolean') return { boolValue: value };
  if (Number.isInteger(value)) return { intValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  return { stringValue: String(value) };
}

function otlpAttributes(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({ key, value: otlpValue(value) }));
}

function traceEnvelope(span, serviceName = 'interactive-evidence-presenter.server') {
  return {
    resourceSpans: [{
      resource: { attributes: otlpAttributes({ 'service.name': serviceName }) },
      scopeSpans: [{ scope: { name: 'interactive-evidence-presenter.manual-otel', version: '0.1.0' }, spans: [span] }]
    }]
  };
}

function parseTraceparent(value) {
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(value ?? '');
  if (!match) return null;
  if (/^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase(), traceFlags: match[3].toLowerCase() };
}

async function readJson(req, maxBytes = 1_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('payload-too-large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function ingestOtlp(pathname, payload) {
  if (pathname === '/v1/traces') telemetryStore.ingestTraces(payload);
  if (pathname === '/v1/logs') telemetryStore.ingestLogs(payload);
  if (pathname === '/v1/metrics') telemetryStore.ingestMetrics(payload);
}

function firstHeader(value) {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value.split(',')[0].trim() : undefined;
}

function httpServerAttributes(req, pathname, statusCode) {
  const forwardedProto = firstHeader(req.headers['x-forwarded-proto']);
  const scheme = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
  const hostHeader = firstHeader(req.headers['x-forwarded-host']) || firstHeader(req.headers.host) || 'localhost';
  let serverAddress = hostHeader;
  let serverPort = scheme === 'https' ? 443 : 80;
  try {
    const authority = new URL(`${scheme}://${hostHeader}`);
    serverAddress = authority.hostname;
    serverPort = Number(authority.port || serverPort);
  } catch {
    // Keep best-effort Host value; semantic conventions explicitly require best effort.
  }

  const forwardedFor = firstHeader(req.headers['x-forwarded-for']);
  const clientAddress = forwardedFor || req.socket.remoteAddress;
  const attributes = {
    'http.request.method': req.method,
    'url.path': pathname,
    'url.scheme': scheme,
    'http.route': pathname === '/' ? '/' : undefined,
    'http.response.status_code': statusCode,
    'network.protocol.version': req.httpVersion,
    'server.address': serverAddress,
    'server.port': serverPort,
    'client.address': clientAddress,
    'network.peer.address': req.socket.remoteAddress,
    'network.peer.port': req.socket.remotePort
  };

  if (statusCode >= 500) attributes['error.type'] = String(statusCode);
  return attributes;
}

function recordServerSpan(traceContext, req, pathname, statusCode, startTimeUnixNano) {
  if (!traceContext) return;
  const span = {
    traceId: traceContext.traceId,
    spanId: randomBytes(8).toString('hex'),
    parentSpanId: traceContext.parentSpanId,
    name: `${req.method} ${pathname === '/' ? '/' : ''}`.trim(),
    kind: 2,
    startTimeUnixNano,
    endTimeUnixNano: nowNs(),
    attributes: otlpAttributes(httpServerAttributes(req, pathname, statusCode))
  };
  // HTTP semantic conventions require Status to remain UNSET for successful server spans
  // and for server-side 4xx responses. 5xx responses are errors.
  if (statusCode >= 500) span.status = { code: 2 };
  telemetryStore.ingestTraces(traceEnvelope(span));
}

const server = createServer(async (req, res) => {
  setSecurityHeaders(res);
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  if (EVIDENCE_TEST_MODE && req.method === 'POST' && ['/v1/traces', '/v1/logs', '/v1/metrics'].includes(pathname)) {
    if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      return json(res, 415, { error: 'OTLP JSON requires application/json' });
    }
    try {
      const payload = await readJson(req);
      ingestOtlp(pathname, payload);
      return json(res, 200, {});
    } catch (error) {
      return json(res, error?.message === 'payload-too-large' ? 413 : 400, { error: error?.message ?? 'invalid-json' });
    }
  }

  if (EVIDENCE_TEST_MODE && req.method === 'POST' && pathname === '/api/evidence/v1/reset') {
    telemetryStore.reset();
    return json(res, 200, { status: 'reset' });
  }

  if (EVIDENCE_TEST_MODE && req.method === 'GET' && pathname.startsWith('/api/evidence/v1/spans/')) {
    const spanId = pathname.slice('/api/evidence/v1/spans/'.length).toLowerCase();
    const bundle = telemetryStore.getSpanBundle(spanId);
    return bundle ? json(res, 200, bundle) : json(res, 404, { error: 'span-not-found', spanId });
  }

  if (EVIDENCE_TEST_MODE && req.method === 'GET' && pathname.startsWith('/api/evidence/v1/traces/')) {
    const traceId = pathname.slice('/api/evidence/v1/traces/'.length).toLowerCase();
    const bundle = telemetryStore.getTraceBundle(traceId);
    return bundle ? json(res, 200, bundle) : json(res, 404, { error: 'trace-not-found', traceId });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }

  if (pathname === '/healthz') {
    return json(res, 200, { status: 'ok', service: 'interactive-evidence-presenter', evidenceTestMode: EVIDENCE_TEST_MODE });
  }

  const startTimeUnixNano = nowNs();
  const incomingTrace = EVIDENCE_TEST_MODE && pathname === '/' ? parseTraceparent(req.headers.traceparent) : null;
  const filePath = safePath(req.url ?? '/');
  if (!filePath) {
    recordServerSpan(incomingTrace, req, pathname, 400, startTimeUnixNano);
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad Request');
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not-file');
    const body = await readFile(filePath);
    recordServerSpan(incomingTrace, req, pathname, 200, startTimeUnixNano);
    res.writeHead(200, { 'Content-Type': MIME.get(extname(filePath)) ?? 'application/octet-stream' });
    return req.method === 'HEAD' ? res.end() : res.end(body);
  } catch {
    recordServerSpan(incomingTrace, req, pathname, 404, startTimeUnixNano);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Interactive Evidence Presenter listening on http://${HOST}:${PORT}${EVIDENCE_TEST_MODE ? ' [evidence-test-mode]' : ''}`);
});
