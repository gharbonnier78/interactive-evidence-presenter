import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = [
  'server.mjs',
  'telemetry-store.mjs',
  'app/index.html',
  'app/main.mjs',
  'app/core.mjs',
  'app/semantic-core.mjs',
  'app/typegpu.mjs',
  'app/mediapipe.mjs',
  'app/telemetry.mjs',
  'e2e/contracts/E2E-REFERENCE-001.json',
  'e2e/contracts/E2E-SEMANTIC-002.json',
  'e2e/scenarios/E2E-REFERENCE-001.json',
  'e2e/scenarios/E2E-SEMANTIC-002.json',
  'scripts/build-uat-report.mjs',
  'docs/ARCHITECTURE.md',
  'docs/SECURITY.md',
  'docs/TELEMETRY_EVIDENCE.md',
  'docs/UAT_EVIDENCE_BOOK.md',
  'docs/SERVICE_APIS.md'
];
for (const file of files) await readFile(new URL(file, root), 'utf8');

const server = await readFile(new URL('server.mjs', root), 'utf8');
for (const header of ['Content-Security-Policy','Permissions-Policy','X-Content-Type-Options','Referrer-Policy']) {
  if (!server.includes(header)) throw new Error(`Missing security header: ${header}`);
}
if (!server.includes('EVIDENCE_TEST_MODE')) throw new Error('Telemetry evidence receiver must remain explicitly test-gated');
for (const route of ['/api/semantic/v1/resolve', '/api/explanations/v1/render', '/api/presentation/v1/semantic-manifest']) {
  if (!server.includes(route)) throw new Error(`Missing base service API route: ${route}`);
}

const html = await readFile(new URL('app/index.html', root), 'utf8');
if (/<script(?![^>]+src=)/i.test(html)) throw new Error('Inline script detected; keep CSP-compatible external modules');
if (!html.includes('rel="noopener noreferrer"')) throw new Error('External target=_blank link must use noopener noreferrer');
if (!html.includes('Interactive semantic explorer')) throw new Error('Semantic explorer surface missing');

const dirs = await readdir(new URL('.github/workflows/', root));
if (!dirs.includes('ci.yml') || !dirs.includes('security.yml')) throw new Error('Required CI/security workflows missing');
console.log('Static engineering checks passed.');
