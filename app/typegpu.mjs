const TYPEGPU_URL = 'https://cdn.jsdelivr.net/npm/typegpu@0.12.1/+esm';

let cached;

async function loadTypeGpu() {
  if (!cached) cached = import(TYPEGPU_URL);
  return cached;
}

export async function normalizeOnGpu(values, maxValue) {
  const safe = values.map(Number);
  if (!Number.isFinite(maxValue) || maxValue <= 0) throw new TypeError('maxValue must be positive');
  try {
    const mod = await loadTypeGpu();
    const tgpu = mod.default ?? mod.tgpu ?? mod;
    const d = mod.d;
    if (!tgpu?.init || !d?.arrayOf || !d?.f32) throw new Error('Unexpected TypeGPU module shape');

    const root = await tgpu.init();
    const data = root.createMutable(d.arrayOf(d.f32, safe.length), safe);
    const scale = 1 / maxValue;
    const pipeline = root.createGuardedComputePipeline((index) => {
      'use gpu';
      data.$[index] *= scale;
    });
    pipeline.dispatchThreads(safe.length);
    const result = await data.read();
    return { values: Array.from(result), backend: 'TypeGPU / WebGPU' };
  } catch (error) {
    return {
      values: safe.map((value) => value / maxValue),
      backend: 'CPU fallback',
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
