/**
 * State-Aware Score (7.4.6): учитывает ожидание, путь, среднее время
 * обслуживания и загрузку мойки. Штраф резко растёт при ρ > 0.9.
 */
import type { ScoreWeights } from '../domain/types.js';
import { argmin, meanServiceTimeMin, type Decision, type DecisionContext, type LoadBalancingAlgorithm } from './types.js';

const DEFAULT_WEIGHTS: Required<ScoreWeights> = {
  alpha: 1,
  beta: 1,
  gamma: 0.2,
  delta: 5,
  epsilon: 20,
};

export class StateAwareScoreAlgorithm implements LoadBalancingAlgorithm {
  readonly name = 'state_aware';
  private readonly weights: Required<ScoreWeights>;

  constructor(weights?: ScoreWeights) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  decide(ctx: DecisionContext): Decision {
    if (ctx.candidates.length === 0) return { washId: null, scores: {} };
    const scores: Record<string, number> = {};
    const order: string[] = [];
    for (const candidate of ctx.candidates) {
      const overloadPenalty = candidate.rho > 0.9 ? (candidate.rho - 0.9) / 0.1 : 0;
      scores[candidate.washId] =
        this.weights.alpha * candidate.expectedWaitMin +
        this.weights.beta * candidate.travelTimeMin +
        this.weights.gamma * meanServiceTimeMin(candidate) +
        this.weights.delta * candidate.rho +
        this.weights.epsilon * overloadPenalty;
      order.push(candidate.washId);
    }
    return { washId: argmin(scores, order), scores };
  }
}
