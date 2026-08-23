import { SLIDES, STUDY, CONCEPTS, parseCommand, boundedAnswer } from './core.mjs';
import { renderBoundedExplanation, resolveSemanticSelection } from './semantic-core.mjs';
import { normalizeOnGpu } from './typegpu.mjs';
import { startGestureRecognition } from './mediapipe.mjs';
import { createTelemetry } from './telemetry.mjs';

const telemetry = createTelemetry();
const runtimeMode = document.querySelector('meta[name="iep-runtime-mode"]')?.content ?? 'api-preferred';
const $ = (selector) => document.querySelector(selector);
const els = {
  stage: $('#presentation-stage'),
  eyebrow: $('#eyebrow'), title: $('#slide-title'), body: $('#slide-body'), counter: $('#counter'),
  chart: $('#result-chart'), chartBackend: $('#chart-backend'), evidence: $('#evidence-copy'),
  conceptTitle: $('#concept-title'), conceptCopy: $('#concept-copy'), emma: $('#emma-copy'),
  selectionText: $('#selection-text'), selectionSource: $('#selection-source'), externalFallback: $('#external-fallback'),
  command: $('#command'), video: $('#presenter-video'), cameraStatus: $('#camera-status'),
  gestureStatus: $('#gesture-status'), gestureButton: $('#gesture-button'), micButton: $('#mic-button')
};

let slideIndex = 0;
let stopGestures = null;
let mediaStream = null;
let lastSemanticQuery = null;
let lastSemanticResolution = null;

function setText(node, value) { node.textContent = value; }

function renderSlide() {
  const slide = SLIDES[slideIndex];
  setText(els.eyebrow, slide.eyebrow);
  setText(els.title, slide.title);
  setText(els.body, slide.body);
  setText(els.counter, `${slideIndex + 1} / ${SLIDES.length}`);
  document.body.dataset.slide = slide.id;
}

function navigateTo(nextIndex, action) {
  const from = SLIDES[slideIndex].id;
  const to = SLIDES[nextIndex].id;
  const span = telemetry.startSpan('iep.slide.navigate', {
    'iep.slide.from': from,
    'iep.slide.to': to,
    'iep.navigation.action': action
  });
  slideIndex = nextIndex;
  renderSlide();
  span.end({ eventName: 'iep.slide.navigated', eventBody: `Slide ${from} -> ${to}` });
}

function next() { navigateTo((slideIndex + 1) % SLIDES.length, 'next'); }
function previous() { navigateTo((slideIndex - 1 + SLIDES.length) % SLIDES.length, 'previous'); }
function show(id) {
  const i = SLIDES.findIndex((slide) => slide.id === id);
  if (i >= 0) navigateTo(i, 'show');
}

function showConcept(id) {
  const concept = CONCEPTS[id];
  if (!concept) return;
  const span = telemetry.startSpan('iep.concept.open', {
    'iep.concept.id': id,
    'iep.concept.name': concept.title,
    'iep.claim.id': STUDY.claim
  });
  setText(els.conceptTitle, concept.title);
  setText(els.conceptCopy, concept.deep);
  setText(els.selectionText, `Explicit semantic concept · ${concept.title}`);
  setText(els.selectionSource, 'Diderot/local');
  els.selectionSource.className = 'source-pill diderot';
  els.externalFallback.hidden = true;
  setText(els.emma, concept.short);
  span.end({ eventName: 'iep.concept.opened', eventBody: `Concept ${concept.title} opened` });
}

function execute(raw) {
  const command = parseCommand(raw);
  if (command.type === 'next') { next(); setText(els.emma, 'Next slide.'); return; }
  if (command.type === 'previous') { previous(); setText(els.emma, 'Previous slide.'); return; }
  if (command.type === 'show') { show(command.id); setText(els.emma, 'Showing Study 0 evidence.'); return; }
  if (command.type === 'concept') { showConcept(command.id); return; }
  const answer = boundedAnswer(command);
  if (answer) setText(els.emma, answer);
}

function drawBars(normalized) {
  const canvas = els.chart;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);
  ctx.font = '13px system-ui';
  ctx.textBaseline = 'middle';

  const marginX = 120;
  const top = 36;
  const row = 58;
  const available = width - marginX - 32;
  STUDY.ucb.forEach((item, i) => {
    const y = top + i * row;
    ctx.fillStyle = '#aab4c8';
    ctx.fillText(item.route, 12, y + 10);
    ctx.fillStyle = '#26324c';
    ctx.fillRect(marginX, y, available, 20);
    ctx.fillStyle = i === 2 ? '#9c7cff' : '#5fd1c7';
    ctx.fillRect(marginX, y, Math.max(4, normalized[i] * available), 20);
    ctx.fillStyle = '#f5f7fb';
    ctx.fillText(item.high.toFixed(3), marginX + Math.min(available - 42, normalized[i] * available + 8), y + 10);
  });

  const marginPosition = STUDY.nonInferiorityMargin / 0.2;
  const x = marginX + marginPosition * available;
  ctx.strokeStyle = '#ffcc66';
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x, height - 10); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffcc66';
  ctx.fillText('NI margin 0.03', Math.min(width - 96, x + 6), 14);
}

async function initChart() {
  const highs = STUDY.ucb.map((item) => item.high);
  const result = await normalizeOnGpu(highs, 0.2);
  drawBars(result.values);
  setText(els.chartBackend, result.backend);
  if (result.reason) els.chartBackend.title = result.reason;
}

function localStaticResult(query, depth) {
  const resolution = resolveSemanticSelection(query);
  return {
    resolution,
    explanation: renderBoundedExplanation(resolution, depth),
    transport: 'local-static-preview'
  };
}

function apiErrorResult(query, depth, error) {
  const resolution = {
    schemaVersion: '1.1',
    query,
    status: 'error',
    semantic: null,
    knowledge: null,
    fallback: { required: false, nextTier: null }
  };
  return {
    resolution,
    explanation: renderBoundedExplanation(resolution, depth),
    transport: 'api-error',
    error: error instanceof Error ? error.message : String(error)
  };
}

async function resolveThroughService(query, depth = 'intuition') {
  if (runtimeMode === 'static-preview') return localStaticResult(query, depth);

  try {
    const response = await fetch('/api/explanations/v1/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...query, depth }),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`resolver API ${response.status}`);
    const body = await response.json();
    if (!body?.resolution || !body?.explanation) throw new Error('resolver API malformed response');
    return { ...body, transport: 'api' };
  } catch (error) {
    return apiErrorResult(query, depth, error);
  }
}

function renderSemanticResult(result, selectedText) {
  const { resolution, explanation, transport } = result;
  lastSemanticResolution = resolution;
  setText(els.selectionText, `Selected: “${selectedText}”`);

  if (resolution.status === 'error') {
    setText(els.conceptTitle, 'Resolver unavailable');
    setText(els.conceptCopy, explanation.text);
    setText(els.selectionSource, 'API error');
    els.selectionSource.className = 'source-pill api-error';
    els.externalFallback.hidden = true;
    return;
  }

  if (resolution.status === 'resolved') {
    setText(els.conceptTitle, explanation.title);
    setText(els.conceptCopy, explanation.text);
    setText(els.selectionSource, `Diderot · ${transport}`);
    els.selectionSource.className = 'source-pill diderot';
    els.externalFallback.hidden = true;
    return;
  }

  setText(els.conceptTitle, selectedText || 'Unresolved selection');
  setText(els.conceptCopy, explanation.text);
  setText(els.selectionSource, 'Internet fallback');
  els.selectionSource.className = 'source-pill internet';
  if (resolution.fallback?.webSearchUrl) {
    els.externalFallback.href = resolution.fallback.webSearchUrl;
    els.externalFallback.hidden = false;
  } else {
    els.externalFallback.hidden = true;
  }
}

async function resolveInteractiveSelection(query, depth = 'intuition') {
  const selectedText = String(query.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (selectedText.length < 2) return null;
  lastSemanticQuery = { ...query, text: selectedText };

  const resolveSpan = telemetry.startSpan('iep.semantic.resolve', {
    'iep.selection.type': query.elementType ?? 'text',
    'iep.selection.text': selectedText,
    'iep.slide.id': query.slideId ?? SLIDES[slideIndex].id
  });
  const result = await resolveThroughService(lastSemanticQuery, depth);
  const source = result.resolution.knowledge?.source?.tier ?? result.resolution.fallback?.nextTier ?? 'none';
  resolveSpan.end({
    eventName: result.resolution.status === 'error' ? 'iep.semantic.failed' : 'iep.semantic.resolved',
    eventBody: `Semantic selection ${selectedText}`,
    statusCode: result.resolution.status === 'error' ? 2 : 1,
    extraAttributes: {
      'iep.semantic.status': result.resolution.status,
      'iep.semantic.id': result.resolution.semantic?.id ?? 'unresolved',
      'iep.resolver.source': source,
      'iep.resolver.transport': result.transport
    }
  });

  const explanationSpan = telemetry.startSpan('iep.explanation.render', {
    'iep.semantic.id': result.resolution.semantic?.id ?? 'unresolved',
    'iep.explanation.depth': depth,
    'iep.resolver.source': source
  });
  renderSemanticResult(result, selectedText);
  explanationSpan.end({
    eventName: result.resolution.status === 'error' ? 'iep.explanation.failed' : 'iep.explanation.rendered',
    eventBody: `Explanation rendered for ${selectedText}`,
    statusCode: result.resolution.status === 'error' ? 2 : 1
  });
  return result;
}

function selectionContext(selection) {
  if (!selection?.rangeCount) return '';
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!element || !els.stage.contains(element)) return '';
  const container = element.closest('p,h1,h2,button,.caption,.lead,.eyebrow') ?? element.closest('.slide-copy,.chart-card') ?? element;
  return String(container.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function handleTextSelection() {
  const selection = window.getSelection();
  const text = String(selection?.toString() ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > 180) return;
  const context = selectionContext(selection);
  if (!context) return;
  await resolveInteractiveSelection({
    text,
    context,
    slideId: SLIDES[slideIndex].id,
    elementType: 'text'
  });
}

async function handleChartPick(event) {
  const rect = els.chart.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const top = 36;
  const row = 58;
  const index = STUDY.ucb.findIndex((_, i) => y >= top + i * row - 8 && y <= top + i * row + 30);
  if (index < 0) return;
  const route = STUDY.ucb[index];
  await resolveInteractiveSelection({
    text: route.route,
    context: `Study 0 corrected UCB route ${route.route}, high ${route.high}, non-inferiority margin ${STUDY.nonInferiorityMargin}.`,
    slideId: SLIDES[slideIndex].id,
    elementType: 'figure-region',
    semanticHint: `study0.route.${index}`
  });
}

async function renderLastDepth(depth) {
  if (!lastSemanticQuery || !lastSemanticResolution) return;
  const result = await resolveThroughService(lastSemanticQuery, depth);
  const source = result.resolution.knowledge?.source?.tier ?? result.resolution.fallback?.nextTier ?? 'none';
  const span = telemetry.startSpan('iep.explanation.render', {
    'iep.semantic.id': result.resolution.semantic?.id ?? 'unresolved',
    'iep.explanation.depth': depth,
    'iep.resolver.source': source
  });
  renderSemanticResult(result, lastSemanticQuery.text);
  span.end({
    eventName: result.resolution.status === 'error' ? 'iep.explanation.failed' : 'iep.explanation.rendered',
    eventBody: `Explanation depth ${depth}`,
    statusCode: result.resolution.status === 'error' ? 2 : 1
  });
}

async function startCamera() {
  if (mediaStream) return;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    els.video.srcObject = mediaStream;
    await els.video.play();
    setText(els.cameraStatus, 'camera local · no upload');
  } catch (error) {
    setText(els.cameraStatus, error instanceof Error ? error.message : 'Camera unavailable');
  }
}

async function toggleGestures() {
  if (stopGestures) {
    stopGestures(); stopGestures = null;
    setText(els.gestureStatus, 'gestures off');
    els.gestureButton.textContent = 'Enable gestures';
    return;
  }
  await startCamera();
  if (!mediaStream) return;
  try {
    setText(els.gestureStatus, 'loading MediaPipe…');
    stopGestures = await startGestureRecognition(els.video, (gesture) => {
      if (gesture === 'next') next();
      if (gesture === 'previous') previous();
      if (gesture === 'cancel') setText(els.emma, 'Gesture command cancelled.');
    }, (status) => setText(els.gestureStatus, status));
    els.gestureButton.textContent = 'Disable gestures';
  } catch (error) {
    setText(els.gestureStatus, error instanceof Error ? error.message : 'MediaPipe unavailable');
  }
}

function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { setText(els.emma, 'Speech recognition is not available in this browser.'); return; }
  const recognition = new Recognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    els.command.value = text;
    execute(text);
  };
  recognition.onerror = (event) => setText(els.emma, `Voice: ${event.error}`);
  recognition.start();
}

function bind() {
  $('#next').addEventListener('click', next);
  $('#previous').addEventListener('click', previous);
  $('#camera-button').addEventListener('click', startCamera);
  els.gestureButton.addEventListener('click', toggleGestures);
  els.micButton.addEventListener('click', startVoice);
  $('#ask-form').addEventListener('submit', (event) => { event.preventDefault(); execute(els.command.value); });
  document.querySelectorAll('[data-concept]').forEach((button) => button.addEventListener('click', () => showConcept(button.dataset.concept)));
  document.querySelectorAll('[data-depth]').forEach((button) => button.addEventListener('click', () => renderLastDepth(button.dataset.depth)));
  els.stage.addEventListener('mouseup', () => setTimeout(handleTextSelection, 0));
  els.chart.addEventListener('click', handleChartPick);
  window.addEventListener('resize', () => initChart());
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') previous();
  });
}

const openSpan = telemetry.startSpan('iep.presenter.open', { 'iep.slide.id': SLIDES[slideIndex].id });
renderSlide();
openSpan.end({ eventName: 'iep.presenter.opened', eventBody: 'Presenter opened', metric: false });

const evidenceSpan = telemetry.startSpan('iep.evidence.render', {
  'iep.claim.id': STUDY.claim,
  'iep.claim.status': STUDY.claimStatus
});
setText(els.evidence, `${STUDY.claim}: ${STUDY.claimStatus}. ${STUDY.statement}`);
evidenceSpan.end({ eventName: 'iep.evidence.rendered', eventBody: 'Claim evidence rendered', metric: false });

bind();
initChart();
