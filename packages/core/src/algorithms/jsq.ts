/**
 * JSQ (7.4.3): argmin(queue + busy + inTransit) — эффективная длина очереди
 * обязательно включает n_transit (F-11, защита от herd-эффекта).
 */
import { argmin, type Decision, type DecisionContext, type LoadBalancingAlgorithm } from './types.js';

export class JsqAlgorithm implements LoadBalancingAlgorithm {
  readonly name = 'jsq';

  decide(ctx: DecisionContext): Decision {
    if (ctx.candidates.length === 0) return { washId: null, scores: {} };
    const scores: Record<string, number> = {};
    const order: string[] = [];
    for (const c of ctx.candidates) {
      scores[c.washId] = c.queueLength + c.busyPosts + c.inTransit;
      order.push(c.washId);
    }
    return { washId: argmin(scores, order), scores };
  }
}
