import type { LoadBalancingAlgorithm } from './types.js';
import { RandomAlgorithm } from './random.js';
import { JsqAlgorithm } from './jsq.js';
import { WeightedJsqAlgorithm } from './weightedJsq.js';

export * from './types.js';
export { RandomAlgorithm } from './random.js';
export { JsqAlgorithm } from './jsq.js';
export { WeightedJsqAlgorithm } from './weightedJsq.js';

/** Реестр алгоритмов этапа 1; F-05 — переключение по имени в runtime. */
export function createAlgorithm(name: string): LoadBalancingAlgorithm {
  switch (name) {
    case 'random':
      return new RandomAlgorithm();
    case 'jsq':
      return new JsqAlgorithm();
    case 'weighted_jsq':
      return new WeightedJsqAlgorithm();
    default:
      throw new Error(`Неизвестный алгоритм: ${name}`);
  }
}
