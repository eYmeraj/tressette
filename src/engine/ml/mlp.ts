/** Weights exported by ml/train.py: dense layers with ReLU between them, as base64 little-endian float32. */
export interface MlpWeights {
  players: 2 | 4;
  features: number;
  /** The network's outputs are scores divided by this. */
  scale: number;
  layers: { in: number; out: number; w: string; b: string }[];
  /** One input and the scores PyTorch gave it. */
  check?: { x: string; y: string };
}

interface Layer {
  in: number;
  out: number;
  /** Row-major [out][in]. */
  w: Float32Array;
  b: Float32Array;
}

export function floats(base64: string): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return new Float32Array(bytes.buffer);
}

/** A forward pass over the exported layers: plain loops, fast enough for one position at a time. */
export function makeMlp(weights: MlpWeights): (x: Float32Array) => Float32Array {
  const layers: Layer[] = weights.layers.map((l) => ({ in: l.in, out: l.out, w: floats(l.w), b: floats(l.b) }));
  return (x) => {
    let a = x;
    layers.forEach((l, k) => {
      const y = new Float32Array(l.out);
      for (let o = 0; o < l.out; o++) {
        let sum = l.b[o];
        const row = o * l.in;
        for (let i = 0; i < l.in; i++) sum += l.w[row + i] * a[i];
        y[o] = k < layers.length - 1 && sum < 0 ? 0 : sum;
      }
      a = y;
    });
    for (let i = 0; i < a.length; i++) a[i] *= weights.scale;
    return a;
  };
}

/** Largest difference between our scores and PyTorch's on the exported check input (0 if there is none). */
export function checkMlp(weights: MlpWeights): number {
  if (!weights.check) return 0;
  const y = makeMlp(weights)(floats(weights.check.x));
  const expected = floats(weights.check.y);
  return Math.max(...expected.map((e, i) => Math.abs(e - y[i])));
}
