/**
 * Weighted JSQ (7.4.4) — основной production-алгоритм:
 *   L_eff_i = (queue + busy + inTransit) / c_i · (1/μ̄_i)
 *   score_i = L_eff_i + w_travel · travelTime_i
 * Учитывает пропускную способность (c, μ̄), n_transit (F-11) и время в пути.
 */
import {
  argmin,
  meanServiceTimeMin,
  type Decision,
  type DecisionContext,
  type LoadBalancingAlgorithm,
} from './types.js';

export class WeightedJsqAlgorithm implements LoadBalancingAlgorithm {
  readonly name = 'weighted_jsq';

  constructor(private readonly wTravel: number = 1) {}

  decide(ctx: DecisionContext): Decision {
    if (ctx.candidates.length === 0) return { washId: null, scores: {} };
    const scores: Record<string, number> = {};
    const order: string[] = [];
    for (const c of ctx.candidates) {
      const queueEff = c.queueLength + c.busyPosts + c.inTransit;
      const lEff = (queueEff / c.totalPosts) * meanServiceTimeMin(c);
      scores[c.washId] = lEff + this.wTravel * c.travelTimeMin;
      order.push(c.washId);
    }
    return { washId: argmin(scores, order), scores };
  }
}
