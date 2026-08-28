/**
 * Контракт алгоритма балансировки (раздел 7.1 спецификации).
 * Ядро гарантирует: алгоритм видит только совместимые и активные мойки —
 * фильтрация по F-07 выполняется диспетчером до вызова.
 */
import type { ServiceTimes, SimTime, WashRequest } from '../domain/types.js';
import type { Rng } from '../rng/mulberry32.js';

export interface WashSnapshot {
  washId: string;
  queueLength: number; // L_q сейчас
  busyPosts: number;
  totalPosts: number; // c
  inTransit: number; // n_transit — едут к этой мойке
  serviceTimeMin: ServiceTimes; // T_service по типам ТС
  rho: number;
  expectedWaitMin: number; // W_q по Erlang C с μ̄
  travelTimeMin: number; // T_travel от точки заявки
}

export interface DecisionContext {
  request: WashRequest; // тип ТС, приоритет, координаты
  candidates: WashSnapshot[]; // только совместимые активные мойки
  now: SimTime;
  rng: Rng; // seeded PRNG — единственный источник случайности
}

export interface Decision {
  washId: string | null; // null — отказ (нет кандидатов)
  scores: Record<string, number>; // score по каждому кандидату — для журнала F-09
}

export interface LoadBalancingAlgorithm {
  readonly name: string;

  decide(ctx: DecisionContext): Decision;
}

/**
 * Среднее время обслуживания μ̄⁻¹ мойки — равные доли по всем типам ТС.
 * Приближение μ̄ (раздел 3.4) для алгоритмов: точный микс потока алгоритму
 * недоступен по контракту 7.1 (в snapshot нет supportedTypes).
 */
export function meanServiceTimeMin(snapshot: WashSnapshot): number {
  const t = snapshot.serviceTimeMin;
  return (t.sedan + t.truck + t.bus) / 3;
}

/** Аргмин по score; при равенстве — первый кандидат (детерминизм). */
export function argmin(scores: Record<string, number>, order: string[]): string {
  let best = order[0] as string;
  for (const id of order) {
    if ((scores[id] as number) < (scores[best] as number)) best = id;
  }
  return best;
}
