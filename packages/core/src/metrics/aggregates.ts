/**
 * Агрегированные метрики системы (раздел 12.1).
 * Считается постфактум по результатам DES-прогона.
 */

import type { CarWash, WashRequest } from '../domain/types.js';
import type { SimulationState, WashRuntimeMetrics } from '../sim/state.js';

export interface WashMetrics {
  assigned: number;
  completed: number;
  avgRho: number;
  avgQueueLength: number;
}

export interface AggregateMetrics {
  totalRequests: number;
  rejected: number;
  completed: number;
  avgWaitMin: number;
  maxWaitMin: number;
  slaViolationRate: number;
  avgTravelMin: number;
  avgRho: number;
  cvRho: number;
  rejectRate: number;
  jainFairness: number;
}

const SLA_WAIT_THRESHOLD = 15;

export function aggregateMetrics(
  requestsById: ReadonlyMap<string, WashRequest>,
  state: SimulationState,
  washes: readonly CarWash[],
  clock: number,
): AggregateMetrics {
  const requests = Array.from(requestsById.values());
  const totalRequests = requests.length;
  const rejected = requests.filter(r => r.targetWash === null).length;

  let waitSum = 0;
  let waitMax = 0;
  let waitCount = 0;
  let slaViolations = 0;

  for (const r of requests) {
    if (r.startedAt !== undefined && r.arrivedAt !== undefined) {
      const wait = r.startedAt - r.arrivedAt;
      waitSum += wait;
      waitMax = Math.max(waitMax, wait);
      waitCount++;
      if (wait > SLA_WAIT_THRESHOLD) slaViolations++;
    }
  }

  let travelSum = 0;
  let travelCount = 0;
  for (const r of requests) {
    if (r.arrivedAt !== undefined && r.targetWash !== null) {
      travelSum += r.arrivedAt - r.assignedAt;
      travelCount++;
    }
  }

  const denom = clock > 0 ? clock : 1;
  const rhos: number[] = [];
  let totalAssigned = 0;
  for (const wash of washes) {
    const m = state.getMetrics(wash.id);
    const rho = m.totalBusyTime / (wash.posts * denom);
    rhos.push(rho);
    totalAssigned += m.assignedCount;
  }

  const avgRho = rhos.length > 0 ? rhos.reduce((a, b) => a + b, 0) / rhos.length : 0;
  const variance = rhos.length > 0
    ? rhos.reduce((sum, rho) => sum + (rho - avgRho) ** 2, 0) / rhos.length
    : 0;
  const cvRho = avgRho > 0 ? Math.sqrt(variance) / avgRho : 0;

  const assignedCounts = washes.map(w => state.getMetrics(w.id).assignedCount);
  const jainFairness = computeJain(assignedCounts);

  return {
    totalRequests,
    rejected,
    completed: requests.filter(r => r.completedAt !== undefined).length,
    avgWaitMin: waitCount > 0 ? waitSum / waitCount : 0,
    maxWaitMin: waitCount > 0 ? waitMax : 0,
    slaViolationRate: waitCount > 0 ? slaViolations / waitCount : 0,
    avgTravelMin: travelCount > 0 ? travelSum / travelCount : 0,
    avgRho,
    cvRho,
    rejectRate: totalRequests > 0 ? rejected / totalRequests : 0,
    jainFairness,
  };
}

function computeJain(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  const sumSq = values.reduce((a, b) => a + b * b, 0);
  if (sumSq === 0) return 1;
  return (sum * sum) / (n * sumSq);
}

export type { WashRuntimeMetrics };
