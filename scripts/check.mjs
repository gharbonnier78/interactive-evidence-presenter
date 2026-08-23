import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = [
  'server.mjs',
  'telemetry-store.mjs',
  'app/index.html',
  'app/main.mjs',
  'app/core.mjs',
  'app/typegpu.mjs',
  'app/mediapipe.mjs',
  'app/telemetry.mjs',
  'e2e/contracts/E2E-REFERENCE-001.json',
  'docs/ARCHITECTURE.md',
  'docs/SECURITY.md',
  'docs/TELEMETRY_EVIDENCE.md'
];
for (const file of files) await readFile(new URL(file, root), 'utf8');

const server = await readFile(new URL('server.mjs', root), 'utf8');
for (const header of ['Content-Security-Policy','Permissions-Policy','X-Content-Type-Options','Referrer-Policy']) {
  if (!server.includes(header)) throw new Error(`Missing security header: ${header}`);
}
if (!server.includes('EVIDENCE_TEST_MODE')) throw new Error('Telemetry evidence receiver must remain explicitly test-gated');

const html = await readFile(new URL('app/index.html', root), 'utf8');
if (/<script(?![^>]+src=)/i.test(html)) throw new Error('Inline script detected; keep CSP-compatible external modules');
if (!html.includes('rel="noopener noreferrer"')) throw new Error('External target=_blank link must use noopener noreferrer');

const dirs = await readdir(new URL('.github/workflows/', root));
if (!dirs.includes('ci.yml') || !dirs.includes('security.yml')) throw new Error('Required CI/security workflows missing');
console.log('Static engineering checks passed.');
