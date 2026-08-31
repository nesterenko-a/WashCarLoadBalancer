/**
 * Power of Two Choices (7.4.5): случайно выбирает два кандидата через
 * seeded PRNG и направляет машину к менее загруженному из них.
 *
 * Случайная подвыборка уменьшает стоимость принятия решения, а n_transit
 * защищает от одновременного выбора одной и той же мойки.
 */
import { argmin, type Decision, type DecisionContext, type LoadBalancingAlgorithm } from './types.js';

export class PowerOfTwoAlgorithm implements LoadBalancingAlgorithm {
  readonly name = 'power_of_two';

  decide(ctx: DecisionContext): Decision {
    if (ctx.candidates.length === 0) return { washId: null, scores: {} };
    const considered = ctx.rng.sample(ctx.candidates, Math.min(2, ctx.candidates.length));
    const scores: Record<string, number> = {};
    const order: string[] = [];
    for (const candidate of ctx.candidates) {
      scores[candidate.washId] = candidate.queueLength + candidate.busyPosts + candidate.inTransit;
    }
    for (const candidate of considered) order.push(candidate.washId);
    return { washId: argmin(scores, order), scores, consideredWashIds: order };
  }
}
