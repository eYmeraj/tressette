/** Weights exported by ml/train.py: dense layers with ReLU between them, as base64 little-endian float32 ([out][in]). */
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
  /** Column-major [in][out], so each non-zero input adds one contiguous column. */
  w: Float32Array;
  b: Float32Array;
}

export function floats(base64: string): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return new Float32Array(bytes.buffer);
}

function transpose(w: Float32Array, rows: number, cols: number): Float32Array {
  const t = new Float32Array(w.length);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) t[c * rows + r] = w[r * cols + c];
  return t;
}

/**
 * A forward pass over the exported layers. Inputs are mostly zeros (a position sets about 15 of 258) and so are
 * about half the hidden values after ReLU, so it adds up only the columns of non-zero inputs: several times
 * faster than a dense product, which matters when the search plays thousands of moves with it.
 */
export function makeMlp(weights: MlpWeights): (x: Float32Array) => Float32Array {
  const layers: Layer[] = weights.layers.map((l) => ({ in: l.in, out: l.out, w: transpose(floats(l.w), l.out, l.in), b: floats(l.b) }));
  return (x) => {
    let a = x;
    layers.forEach((l, k) => {
      const y = Float32Array.from(l.b);
      for (let i = 0; i < l.in; i++) {
        const ai = a[i];
        if (ai === 0) continue;
        const col = i * l.out;
        for (let o = 0; o < l.out; o++) y[o] += ai * l.w[col + o];
      }
      if (k < layers.length - 1) for (let o = 0; o < l.out; o++) if (y[o] < 0) y[o] = 0;
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
