/**
 * Диспетчер (Dispatcher) — раздел 6.2.
 * Фильтрует мойки по совместимости F-07, вызывает алгоритм, резервирует n_transit,
 * ведёт журнал решений F-09. Обрабатывает отказ F-12.
 */

import type { CarWash, SimConfig, SimTime, VehicleType, WashRequest } from '../domain/types.js';
import type { Decision, DecisionContext, LoadBalancingAlgorithm, WashSnapshot } from '../algorithms/types.js';
import type { Rng } from '../rng/mulberry32.js';
import { expectedWait, effectiveMu } from '../math/erlang.js';
import type { RoutePlanner } from '../routing/routePlanner.js';

const HISTORY_WINDOW_MIN = 15;

export interface DispatchDecision extends Decision {
  /** Причины, по которым каждая мойка была отфильтрована (для журнала F-09). */
  rejectedReason: string;
}

export interface DecisionRecord {
  time: SimTime;
  requestId: string;
  vehicleType: VehicleType;
  priority: 'urgent' | 'normal' | 'scheduled';
  algorithm: string;
  chosenWash: string | null;
  scores: Record<string, number>;
  /** Score выбранной мойки: удобен для отображения объяснения решения в UI. */
  chosenScore: number | null;
  /** Снимок расчёта по каждому кандидату для объяснения решения без пересчёта в UI. */
  candidates: DecisionCandidateRecord[];
  rejectedReason: string;
}

export interface DecisionCandidateRecord {
  washId: string;
  travelTimeMin: number;
  expectedWaitMin: number;
  rho: number;
  score: number;
}

/**
 * История поступлений на мойку за последние 15 минут — для оценки λ и μ̄.
 */
interface ArrivalHistory {
  times: number[];
  types: VehicleType[];
}

export class Dispatcher {
  constructor(
    private readonly washes: readonly CarWash[],
    private readonly config: SimConfig,
    private readonly algorithm: LoadBalancingAlgorithm,
    private readonly routePlanner?: RoutePlanner,
  ) {}

  /**
   * Построить снапшоты совместимых активных моек и вызвать алгоритм.
   * Возвращает выбор + журнальную запись.
   */
  dispatch(
    request: WashRequest,
    now: SimTime,
    state: Readonly<WashStateView>,
    rng: Rng,
  ): { decision: Decision; record: DecisionRecord } {
    const candidates: WashSnapshot[] = [];
    const rejectReasons: string[] = [];

    for (const wash of this.washes) {
      const reason = this.checkEligibility(wash, request.vehicle.type);
      if (reason) {
        rejectReasons.push(`${wash.id}:${reason}`);
        continue;
      }
      candidates.push(this.buildSnapshot(wash, request, state));
    }

    const ctx: DecisionContext = {
      request,
      candidates,
      now,
      rng,
    };

    const decision = this.algorithm.decide(ctx);
    const record: DecisionRecord = {
      time: now,
      requestId: request.id,
      vehicleType: request.vehicle.type,
      priority: request.vehicle.priority,
      algorithm: this.algorithm.name,
      chosenWash: decision.washId,
      scores: decision.scores,
      chosenScore: decision.washId === null ? null : decision.scores[decision.washId] ?? null,
      candidates: candidates.map(candidate => ({
        washId: candidate.washId,
        travelTimeMin: candidate.travelTimeMin,
        expectedWaitMin: candidate.expectedWaitMin,
        rho: candidate.rho,
        score: decision.scores[candidate.washId] ?? 0,
      })),
      rejectedReason: rejectReasons.join('; '),
    };

    return { decision, record };
  }

  private checkEligibility(wash: CarWash, type: VehicleType): string | null {
    if (!wash.isActive) return 'inactive';
    if (!wash.supportedTypes.includes(type)) return `incompatible:${type}`;
    return null;
  }

  private buildSnapshot(
    wash: CarWash,
    request: WashRequest,
    state: Readonly<WashStateView>,
  ): WashSnapshot {
    const washState = state.getWash(wash.id);
    const travelMin = this.computeTravelTime(wash, request.vehicle);
    const history = state.getHistory(wash.id);
    const { lambda, muBar } = this.estimateLoad(wash, history, washState.inTransit);

    const rho = Math.min(lambda / (wash.posts * muBar), 0.9999);
    const expectedWaitMin =
      lambda > 0 && wash.posts * muBar > lambda
        ? expectedWait(lambda, muBar, wash.posts)
        : 0;

    return {
      washId: wash.id,
      queueLength: washState.queue.length,
      busyPosts: washState.busyPosts,
      totalPosts: wash.posts,
      inTransit: washState.inTransit,
      serviceTimeMin: wash.serviceTimeMin,
      rho,
      expectedWaitMin,
      travelTimeMin: travelMin,
    };
  }

  private computeTravelTime(wash: CarWash, vehicle: WashRequest['vehicle']): number {
    if (this.routePlanner) {
      return this.routePlanner.plan(vehicle, wash).distanceMeters / ((this.config.avgSpeedKmh * 1000) / 60);
    }
    const location = vehicle.location;
    const [x1, y1] = location;
    const [x2, y2] = wash.coordinates;
    let distance: number;
    if (this.config.distanceMetric === 'euclidean') {
      distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    } else {
      distance = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    }
    const speedMetersPerMin = (this.config.avgSpeedKmh * 1000) / 60;
    return distance / speedMetersPerMin;
  }

  private estimateLoad(
    wash: CarWash,
    history: ArrivalHistory,
    inTransit: number,
  ): { lambda: number; muBar: number } {
    const totalArrivals = history.times.length;
    if (totalArrivals === 0) {
      return { lambda: 0, muBar: 1 / this.meanServiceTime(wash) };
    }
    const lambdaPerMin = totalArrivals / HISTORY_WINDOW_MIN + inTransit / HISTORY_WINDOW_MIN;
    const shares = this.computeShares(history.types);
    const muBar = effectiveMu(wash.serviceTimeMin, shares);
    return { lambda: lambdaPerMin, muBar };
  }

  private meanServiceTime(wash: CarWash): number {
    const t = wash.serviceTimeMin;
    return (t.sedan + t.truck + t.bus) / 3;
  }

  private computeShares(types: VehicleType[]): { sedan: number; truck: number; bus: number } {
    const n = types.length;
    if (n === 0) return { sedan: 0, truck: 0, bus: 0 };
    const counts = { sedan: 0, truck: 0, bus: 0 };
    for (const type of types) counts[type]++;
    return {
      sedan: counts.sedan / n,
      truck: counts.truck / n,
      bus: counts.bus / n,
    };
  }
}

/**
 * Вид состояния моек, который диспетчер может запрашивать.
 * Реализуется DES-движком (src/sim/engine.ts).
 */
export interface WashStateView {
  getWash(id: string): {
    queue: readonly WashRequest[];
    busyPosts: number;
    inTransit: number;
  };
  getHistory(id: string): ArrivalHistory;
}
