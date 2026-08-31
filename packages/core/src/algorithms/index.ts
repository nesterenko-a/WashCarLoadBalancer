import type { LoadBalancingAlgorithm } from './types.js';
import { RandomAlgorithm } from './random.js';
import { JsqAlgorithm } from './jsq.js';
import { WeightedJsqAlgorithm } from './weightedJsq.js';
import { PowerOfTwoAlgorithm } from './powerOfTwo.js';
import { StateAwareScoreAlgorithm } from './stateAwareScore.js';
import { RoundRobinAlgorithm } from './roundRobin.js';
import type { ScoreWeights } from '../domain/types.js';

export * from './types.js';
export { RandomAlgorithm } from './random.js';
export { JsqAlgorithm } from './jsq.js';
export { WeightedJsqAlgorithm } from './weightedJsq.js';
export { PowerOfTwoAlgorithm } from './powerOfTwo.js';
export { StateAwareScoreAlgorithm } from './stateAwareScore.js';
export { RoundRobinAlgorithm } from './roundRobin.js';

/** Реестр алгоритмов этапа 1; F-05 — переключение по имени в runtime. */
export function createAlgorithm(name: string, weights?: ScoreWeights): LoadBalancingAlgorithm {
  switch (name) {
    case 'random':
      return new RandomAlgorithm();
    case 'jsq':
      return new JsqAlgorithm();
    case 'weighted_jsq':
      return new WeightedJsqAlgorithm();
    case 'power_of_two':
      return new PowerOfTwoAlgorithm();
    case 'state_aware':
      return new StateAwareScoreAlgorithm(weights);
    case 'round_robin':
      return new RoundRobinAlgorithm();
    default:
      throw new Error(`Неизвестный алгоритм: ${name}`);
  }
}
