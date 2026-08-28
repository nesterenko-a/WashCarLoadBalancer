/**
 * Seeded PRNG mulberry32 — единственный источник случайности в ядре (NF-10).
 * Math.random() в packages/core запрещён.
 */

export interface Rng {
  /** Равномерное [0, 1). */
  next(): number;
  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number;
  /** Экспоненциальное распределение с интенсивностью rate (среднее = 1/rate). */
  exponential(rate: number): number;
  /** n различных случайных элементов массива (partial Fisher–Yates). */
  sample<T>(array: readonly T[], n: number): T[];
}

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,

    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },

    exponential(rate: number): number {
      if (rate <= 0) throw new Error('exponential: rate должен быть > 0');
      // inverse transform sampling; 1 - u ∈ (0, 1] — защита от log(0)
      return -Math.log(1 - next()) / rate;
    },

    sample<T>(array: readonly T[], n: number): T[] {
      if (n > array.length) {
        throw new Error(`sample: n=${n} больше длины массива ${array.length}`);
      }
      const copy = array.slice();
      const k = Math.min(n, copy.length);
      for (let i = 0; i < k; i++) {
        const j = i + Math.floor(next() * (copy.length - i));
        const tmp = copy[i] as T;
        copy[i] = copy[j] as T;
        copy[j] = tmp;
      }
      return copy.slice(0, k);
    },
  };
}
