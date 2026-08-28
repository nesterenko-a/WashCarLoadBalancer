/**
 * Random (7.4.1) — baseline. Случайность только через ctx.rng (NF-10).
 * Любой осмысленный алгоритм обязан превосходить Random (12.2).
 */
import type { Decision, DecisionContext, LoadBalancingAlgorithm } from './types.js';

export class RandomAlgorithm implements LoadBalancingAlgorithm {
  readonly name = 'random';

  decide(ctx: DecisionContext): Decision {
    if (ctx.candidates.length === 0) return { washId: null, scores: {} };
    const idx = ctx.rng.int(0, ctx.candidates.length - 1);
    const chosen = ctx.candidates[idx]!;
    // score — индикатор выбора (1 у выбранной, 0 у остальных) для журнала F-09
    const scores: Record<string, number> = {};
    for (const c of ctx.candidates) scores[c.washId] = c.washId === chosen.washId ? 1 : 0;
    return { washId: chosen.washId, scores };
  }
}
