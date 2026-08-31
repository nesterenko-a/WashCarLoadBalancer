/**
 * Round Robin (7.4.2): циклически распределяет заявки между доступными
 * мойками. Не использует состояние очереди и служит статическим baseline.
 */
import type { Decision, DecisionContext, LoadBalancingAlgorithm } from './types.js';

export class RoundRobinAlgorithm implements LoadBalancingAlgorithm {
  readonly name = 'round_robin';
  private cursor = 0;

  decide(ctx: DecisionContext): Decision {
    if (ctx.candidates.length === 0) return { washId: null, scores: {} };
    const chosenIndex = this.cursor % ctx.candidates.length;
    const chosen = ctx.candidates[chosenIndex]!;
    this.cursor += 1;
    const scores: Record<string, number> = {};
    for (let index = 0; index < ctx.candidates.length; index += 1) {
      scores[ctx.candidates[index]!.washId] = (index - chosenIndex + ctx.candidates.length) % ctx.candidates.length;
    }
    return { washId: chosen.washId, scores };
  }
}
