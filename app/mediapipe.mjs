const MEDIAPIPE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export async function startGestureRecognition(video, onGesture, onStatus = () => {}) {
  const mod = await import(MEDIAPIPE_URL);
  const { FilesetResolver, GestureRecognizer } = mod;
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'VIDEO',
    numHands: 1
  });

  let active = true;
  let lastAt = 0;
  const cooldownMs = 1200;

  const loop = () => {
    if (!active) return;
    if (video.readyState >= 2) {
      try {
        const result = recognizer.recognizeForVideo(video, performance.now());
        const category = result.gestures?.[0]?.[0];
        const now = performance.now();
        if (category?.score >= 0.65) {
          onStatus(`${category.categoryName} · ${(category.score * 100).toFixed(0)}%`);
          if (now - lastAt > cooldownMs) {
            const mapped = { Thumb_Up: 'next', Victory: 'previous', Open_Palm: 'cancel' }[category.categoryName];
            if (mapped) {
              lastAt = now;
              onGesture(mapped);
            }
          }
        }
      } catch (error) {
        onStatus(error instanceof Error ? error.message : String(error));
      }
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
  return () => {
    active = false;
    recognizer.close();
  };
}
