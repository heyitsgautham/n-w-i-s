/** Seeded random streams. Each named stream is independent, so adding a well never reshuffles another. */

function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  range(min: number, max: number): number;
  normal(mean: number, sd: number): number;
  int(min: number, maxInclusive: number): number;
  poisson(lambda: number): number;
}

export function rng(seed: number, stream: string): Rng {
  let state = (seed ^ hash32(stream)) >>> 0;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    normal: (mean, sd) => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    int: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    poisson: (lambda) => {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = next();
      while (p > limit) {
        k++;
        p *= next();
      }
      return k;
    },
  };
}
