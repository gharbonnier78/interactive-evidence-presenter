import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(new URL('../', import.meta.url).pathname);
const evidenceRoot = join(root, 'test-results', 'uat-evidence');
const outputDir = join(root, 'uat-report');

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusBadge(status) {
  const normalized = status === 'PASS' ? 'PASS' : 'FAIL';
  return `<span class="badge ${normalized.toLowerCase()}">${normalized}</span>`;
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function sha256(path) {
  const body = await readFile(path);
  return createHash('sha256').update(body).digest('hex');
}

async function imageDataUri(path) {
  const body = await readFile(path);
  return `data:image/png;base64,${body.toString('base64')}`;
}

function activitySvg(activity) {
  const width = 760;
  const row = 112;
  const height = 80 + activity.length * row;
  const center = width / 2;
  const blocks = activity.map((item, index) => {
    const y = 45 + index * row;
    const arrow = index < activity.length - 1
      ? `<line x1="${center}" y1="${y + 58}" x2="${center}" y2="${y + row - 8}" stroke="#596579" stroke-width="2" marker-end="url(#arrow)"/>`
      : '';
    return `<g>
      <rect x="165" y="${y}" width="430" height="58" rx="14" fill="#f7f9fc" stroke="#94a1b6"/>
      <text x="185" y="${y + 24}" font-size="15" font-weight="700" fill="#18202d">${esc(item.id)} · ${esc(item.label)}</text>
      <text x="185" y="${y + 45}" font-size="12" fill="#596579">span: ${esc(item.span)}</text>
      ${arrow}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Activity diagram">
    <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#596579"/></marker></defs>
    <circle cx="${center}" cy="18" r="8" fill="#18202d"/>
    <line x1="${center}" y1="26" x2="${center}" y2="45" stroke="#596579" stroke-width="2"/>
    ${blocks}
    <circle cx="${center}" cy="${height - 18}" r="10" fill="none" stroke="#18202d" stroke-width="2"/>
    <circle cx="${center}" cy="${height - 18}" r="5" fill="#18202d"/>
  </svg>`;
}

function sequenceSvg(sequence) {
  const participants = sequence.participants;
  const messages = sequence.messages;
  const left = 90;
  const col = 155;
  const top = 60;
  const row = 58;
  const width = Math.max(820, left * 2 + (participants.length - 1) * col);
  const height = top + 80 + messages.length * row;
  const xs = Object.fromEntries(participants.map((name, index) => [name, left + index * col]));

  const lifelines = participants.map((name) => {
    const x = xs[name];
    return `<g><rect x="${x - 62}" y="12" width="124" height="38" rx="8" fill="#f7f9fc" stroke="#94a1b6"/>
      <text x="${x}" y="35" text-anchor="middle" font-size="12" font-weight="700" fill="#18202d">${esc(name)}</text>
      <line x1="${x}" y1="50" x2="${x}" y2="${height - 20}" stroke="#b4bdcc" stroke-dasharray="5 5"/></g>`;
  }).join('');

  const arrows = messages.map((message, index) => {
    const y = top + 35 + index * row;
    const x1 = xs[message.from];
    const x2 = xs[message.to];
    const dir = x2 >= x1 ? 1 : -1;
    const labelX = (x1 + x2) / 2;
    return `<g>
      <line x1="${x1}" y1="${y}" x2="${x2 - dir * 7}" y2="${y}" stroke="#596579" stroke-width="1.8" marker-end="url(#seqArrow)"/>
      <text x="${labelX}" y="${y - 8}" text-anchor="middle" font-size="11" fill="#344054">${esc(message.label)}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sequence diagram">
    <defs><marker id="seqArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#596579"/></marker></defs>
    ${lifelines}${arrows}
  </svg>`;
}

function stepTable(step) {
  const checks = step.checks.map((item) => `<tr>
    <td>${esc(item.label)}</td>
    <td>${esc(typeof item.expected === 'object' ? JSON.stringify(item.expected) : item.expected)}</td>
    <td>${esc(typeof item.actual === 'object' ? JSON.stringify(item.actual) : item.actual)}</td>
    <td>${statusBadge(item.status)}</td>
  </tr>`).join('');
  const expected = step.expected.map((item) => `<li>${esc(item)}</li>`).join('');
  return `<section class="step">
    <div class="step-head"><h3>${esc(step.id)} · ${esc(step.title)}</h3>${statusBadge(step.status)}</div>
    <p><strong>Action.</strong> ${esc(step.action)}</p>
    <p><strong>Expected.</strong></p><ul>${expected}</ul>
    <table><thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Verdict</th></tr></thead><tbody>${checks}</tbody></table>
  </section>`;
}

function telemetryTable(validation) {
  return validation.checks.map((item) => `<tr>
    <td>${esc(item.kind)}</td>
    <td>${esc(item.selector)}</td>
    <td><code>${esc(JSON.stringify(item.expected))}</code></td>
    <td><code>${esc(JSON.stringify(item.actual))}</code></td>
    <td>${statusBadge(item.status)}</td>
  </tr>`).join('');
}

async function scenarioChapter(result, index) {
  const scenario = result.scenario;
  const dir = join(evidenceRoot, scenario.id);
  const screenshots = [];
  for (const step of result.steps) {
    if (!step.screenshot) continue;
    const path = join(dir, step.screenshot);
    if (!(await exists(path))) continue;
    screenshots.push({ step, src: await imageDataUri(path), hash: await sha256(path) });
  }

  const files = ['result.json', 'otel-evidence-bundle.json', 'otel-validation.json', 'otel-expected-vs-actual.txt'];
  for (const shot of screenshots) files.push(shot.step.screenshot);
  const manifestRows = [];
  for (const name of files) {
    const path = join(dir, name);
    if (!(await exists(path))) continue;
    manifestRows.push(`<tr><td>${esc(name)}</td><td><code>${await sha256(path)}</code></td></tr>`);
  }

  const stepSections = [];
  for (const step of result.steps) {
    stepSections.push(stepTable(step));
    const shot = screenshots.find((item) => item.step.id === step.id);
    if (shot) {
      stepSections.push(`<figure class="evidence-shot"><img src="${shot.src}" alt="Screenshot for ${esc(step.id)}"/><figcaption>${esc(step.id)} screenshot evidence · sha256 ${shot.hash}</figcaption></figure>`);
    }
  }

  return `<article class="chapter">
    <header class="chapter-title">
      <div class="kicker">Chapter ${index + 1} · ${esc(scenario.useCaseId)}</div>
      <h1>${esc(scenario.title)}</h1>
      <div class="verdict">Scenario verdict ${statusBadge(result.verdict)}</div>
    </header>

    <section><h2>Use case</h2>
      <p>${esc(scenario.purpose)}</p>
      <dl class="meta"><dt>Actor</dt><dd>${esc(scenario.actor)}</dd><dt>Scenario</dt><dd>${esc(scenario.id)}</dd><dt>Target commit</dt><dd><code>${esc(result.execution.targetCommit)}</code></dd><dt>Root SpanId</dt><dd><code>${esc(result.execution.rootSpanId)}</code></dd><dt>TraceId</dt><dd><code>${esc(result.execution.traceId)}</code></dd></dl>
      <h3>Preconditions</h3><ul>${scenario.preconditions.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    </section>

    <section class="diagram"><h2>Activity view</h2><p>This is the behavior path the UAT scenario is intended to exercise.</p>${activitySvg(scenario.activity)}</section>
    <section class="diagram"><h2>Sequence view</h2><p>This view shows the scenario interactions and the telemetry/evidence path used to qualify them.</p>${sequenceSvg(scenario.sequence)}</section>

    <section><h2>Executed scenario — expected versus actual</h2>${stepSections.join('')}</section>

    <section class="telemetry"><h2>OpenTelemetry evidence</h2>
      <p>The report is entered through the Playwright root <strong>SpanId</strong>; the evidence API resolves its TraceId, descendants, correlated LogRecords and metric exemplars. The executable telemetry contract is <strong>${esc(result.telemetry.validation.status)}</strong> with ${result.telemetry.validation.summary.passed}/${result.telemetry.validation.summary.checks} checks passing.</p>
      <table class="telemetry-table"><thead><tr><th>Kind</th><th>Selector</th><th>Expected</th><th>Actual</th><th>Verdict</th></tr></thead><tbody>${telemetryTable(result.telemetry.validation)}</tbody></table>
    </section>

    <section><h2>Evidence manifest</h2><p>Hashes make the retained screenshots and telemetry files independently checkable inside the CI artifact.</p>
      <table><thead><tr><th>Evidence file</th><th>SHA-256</th></tr></thead><tbody>${manifestRows.join('')}</tbody></table>
    </section>
  </article>`;
}

await mkdir(outputDir, { recursive: true });
if (!(await exists(evidenceRoot))) throw new Error(`No UAT evidence directory found: ${evidenceRoot}`);
const dirs = (await readdir(evidenceRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
const results = [];
for (const dirent of dirs) {
  const path = join(evidenceRoot, dirent.name, 'result.json');
  if (await exists(path)) results.push(JSON.parse(await readFile(path, 'utf8')));
}
if (results.length === 0) throw new Error('No UAT scenario result.json files found.');
results.sort((a, b) => a.scenario.id.localeCompare(b.scenario.id));

const chapters = [];
for (let index = 0; index < results.length; index++) chapters.push(await scenarioChapter(results[index], index));
const allPass = results.every((result) => result.verdict === 'PASS');
const toc = results.map((result, index) => `<li>Chapter ${index + 1} — ${esc(result.scenario.useCaseId)} · ${esc(result.scenario.title)} ${statusBadge(result.verdict)}</li>`).join('');
const generatedAt = new Date().toISOString();

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Interactive Evidence Presenter — UAT Evidence Book</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18202d;background:#fff;line-height:1.5}body{margin:0}.cover,.chapter{max-width:1080px;margin:0 auto;padding:54px 64px}.cover{min-height:82vh;display:flex;flex-direction:column;justify-content:center}.kicker{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:#596579;font-weight:700}.cover h1,.chapter-title h1{font-size:44px;line-height:1.08;margin:.25em 0}.cover .overall{font-size:22px;margin-top:24px}.chapter{page-break-before:always}.chapter-title{border-bottom:3px solid #18202d;padding-bottom:22px;margin-bottom:34px}.verdict{font-size:18px}.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.06em}.badge.pass{background:#e8f7ef;color:#176b3a}.badge.fail{background:#fdeaea;color:#a52323}h2{margin-top:42px;border-bottom:1px solid #d9dee8;padding-bottom:8px}h3{margin-top:24px}.meta{display:grid;grid-template-columns:150px 1fr;gap:6px 18px}.meta dt{font-weight:700;color:#596579}.meta dd{margin:0}.diagram{break-inside:avoid}.diagram svg{width:100%;max-height:700px;background:#fff;border:1px solid #e2e6ed;border-radius:12px}.step{margin:28px 0;border:1px solid #d9dee8;border-radius:14px;padding:22px;break-inside:avoid}.step-head{display:flex;align-items:center;justify-content:space-between;gap:20px}.step-head h3{margin:0}.evidence-shot{margin:18px 0 42px;break-inside:avoid}.evidence-shot img{width:100%;border:1px solid #cfd6e2;border-radius:10px;box-shadow:0 8px 24px rgba(24,32,45,.08)}figcaption{font-size:11px;color:#596579;margin-top:8px;word-break:break-all}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e2e6ed;padding:8px}th{background:#f7f9fc}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;overflow-wrap:anywhere}.telemetry-table{font-size:10.5px}.telemetry-table td:nth-child(3),.telemetry-table td:nth-child(4){max-width:280px;overflow-wrap:anywhere}.toc li{margin:8px 0}.note{padding:16px 18px;border-left:4px solid #8290a6;background:#f7f9fc}.footer-note{margin-top:40px;color:#596579;font-size:12px}@media print{.cover,.chapter{padding:32px 38px}.cover h1,.chapter-title h1{font-size:34px}a{color:inherit;text-decoration:none}.step,.evidence-shot,.diagram{break-inside:avoid}table{break-inside:auto}tr{break-inside:avoid}}
</style></head><body>
<section class="cover"><div class="kicker">User Acceptance / Engineering Evidence</div><h1>Interactive Evidence Presenter<br/>Qualification Evidence Book</h1><p>This report reads the test as a reviewable story: use case → activity model → sequence model → executed steps → screenshots → expected versus actual → correlated OpenTelemetry evidence.</p><div class="overall">Overall verdict ${statusBadge(allPass ? 'PASS' : 'FAIL')}</div><p>Generated ${esc(generatedAt)}</p><h2>Contents</h2><ol class="toc">${toc}</ol><div class="note"><strong>Evidence boundary.</strong> Passing this report establishes the bounded software/UAT and telemetry contract exercised here. It does not upgrade the scientific status of Study 0.</div></section>
${chapters.join('\n')}
<section class="chapter"><h1>Review note</h1><p>The HTML and PDF are presentation views over retained machine-readable evidence. The authoritative execution files remain in <code>test-results/uat-evidence/</code> inside the CI artifact.</p><p class="footer-note">Generated by scripts/build-uat-report.mjs.</p></section>
</body></html>`;

const htmlPath = join(outputDir, 'index.html');
await writeFile(htmlPath, html);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
  await page.pdf({
    path: join(outputDir, 'Interactive-Evidence-Presenter-UAT-Evidence-Book.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' }
  });
} finally {
  await browser.close();
}

await writeFile(join(outputDir, 'summary.json'), JSON.stringify({ generatedAt, overallVerdict: allPass ? 'PASS' : 'FAIL', scenarios: results.map((result) => ({ id: result.scenario.id, useCaseId: result.scenario.useCaseId, title: result.scenario.title, verdict: result.verdict, rootSpanId: result.execution.rootSpanId, traceId: result.execution.traceId })) }, null, 2));
console.log(`UAT evidence book generated: ${relative(root, htmlPath)}`);
