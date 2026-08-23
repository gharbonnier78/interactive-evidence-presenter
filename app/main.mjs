import { SLIDES, STUDY, CONCEPTS, parseCommand, boundedAnswer } from './core.mjs';
import { normalizeOnGpu } from './typegpu.mjs';
import { startGestureRecognition } from './mediapipe.mjs';

const $ = (selector) => document.querySelector(selector);
const els = {
  eyebrow: $('#eyebrow'), title: $('#slide-title'), body: $('#slide-body'), counter: $('#counter'),
  chart: $('#result-chart'), chartBackend: $('#chart-backend'), evidence: $('#evidence-copy'),
  conceptTitle: $('#concept-title'), conceptCopy: $('#concept-copy'), emma: $('#emma-copy'),
  command: $('#command'), video: $('#presenter-video'), cameraStatus: $('#camera-status'),
  gestureStatus: $('#gesture-status'), gestureButton: $('#gesture-button'), micButton: $('#mic-button')
};

let slideIndex = 0;
let stopGestures = null;
let mediaStream = null;

function setText(node, value) { node.textContent = value; }

function renderSlide() {
  const slide = SLIDES[slideIndex];
  setText(els.eyebrow, slide.eyebrow);
  setText(els.title, slide.title);
  setText(els.body, slide.body);
  setText(els.counter, `${slideIndex + 1} / ${SLIDES.length}`);
  document.body.dataset.slide = slide.id;
}

function next() { slideIndex = (slideIndex + 1) % SLIDES.length; renderSlide(); }
function previous() { slideIndex = (slideIndex - 1 + SLIDES.length) % SLIDES.length; renderSlide(); }
function show(id) { const i = SLIDES.findIndex((slide) => slide.id === id); if (i >= 0) { slideIndex = i; renderSlide(); } }

function showConcept(id) {
  const concept = CONCEPTS[id];
  if (!concept) return;
  setText(els.conceptTitle, concept.title);
  setText(els.conceptCopy, concept.deep);
  setText(els.emma, concept.short);
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
  window.addEventListener('resize', () => initChart());
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') next();
    if (event.key === 'ArrowLeft') previous();
  });
}

setText(els.evidence, `${STUDY.claim}: ${STUDY.claimStatus}. ${STUDY.statement}`);
renderSlide(); bind(); initChart();
