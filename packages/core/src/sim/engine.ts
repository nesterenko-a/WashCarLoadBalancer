/**
 * DES-движок (раздел 6.3).
 * Переходит от события к событию; все случайности — через seeded PRNG (NF-10).
 */

import type { CarWash, SimConfig, SimTime, Vehicle, WashRequest } from '../domain/types.js';
import type { LoadBalancingAlgorithm } from '../algorithms/types.js';
import type { DecisionRecord, Dispatcher } from '../dispatcher/dispatcher.js';
import type { Rng } from '../rng/mulberry32.js';
import { mulberry32 } from '../rng/mulberry32.js';
import { SimulationState } from './state.js';
import { EventQueue } from './eventQueue.js';
import { aggregateMetrics, type AggregateMetrics, type WashMetrics } from '../metrics/aggregates.js';
import { buildSnapshot, type SimSnapshot } from './snapshots.js';
import type { RoutePlanner } from '../routing/routePlanner.js';

type Event =
  | { time: SimTime; type: 'ARRIVAL'; request: WashRequest }
  | { time: SimTime; type: 'WASH_ARRIVED'; requestId: string; washId: string }
  | { time: SimTime; type: 'SERVICE_START'; requestId: string; washId: string }
  | { time: SimTime; type: 'SERVICE_COMPLETE'; requestId: string; washId: string };

export interface SimulationResult {
  config: SimConfig;
  requests: WashRequest[];
  decisions: DecisionRecord[];
  metrics: AggregateMetrics;
  washMetrics: Record<string, WashMetrics>;
  clock: SimTime;
  snapshots: SimSnapshot[];
}

export interface SimulationInput {
  washes: readonly CarWash[];
  config: SimConfig;
  arrivals: readonly Vehicle[];
  /** Записывать снапшоты для визуального playback. */
  recordSnapshots?: boolean;
  /** Необязательный графовый планировщик: один источник времени пути для DES и UI. */
  routePlanner?: RoutePlanner;
}

export function runSimulation(
  input: SimulationInput,
  dispatcherFactory: (washes: readonly CarWash[], config: SimConfig, rng: Rng) => Dispatcher,
): SimulationResult {
  const { washes, config, arrivals } = input;
  const rng = mulberry32(config.seed);
  const dispatcher = dispatcherFactory(washes, config, rng);
  const state = new SimulationState(washes);
  const queue = new EventQueue<Event>();
  const requestsById = new Map<string, WashRequest>();
  const decisions: DecisionRecord[] = [];
  const snapshots: SimSnapshot[] = [];
  const shouldRecord = input.recordSnapshots ?? false;

  function recordSnapshot(): void {
    if (shouldRecord) {
      snapshots.push(buildSnapshot(clock, washes, state, requestsById));
    }
  }

  // Запланировать ARRIVAL события
  for (const vehicle of arrivals) {
    const request: WashRequest = {
      id: vehicle.id,
      vehicle,
      targetWash: null,
      algorithm: config.algorithm,
      assignedAt: vehicle.arrivalTime,
    };
    requestsById.set(request.id, request);
    queue.push({ time: vehicle.arrivalTime, type: 'ARRIVAL', request });
  }

  let clock: SimTime = 0;
  const simEnd = arrivals.length > 0 ? Math.max(...arrivals.map(v => v.arrivalTime)) + 60 * 24 : 0;

  recordSnapshot();

  while (queue.length > 0 && clock < simEnd) {
    const event = queue.pop();
    if (!event) break;
    clock = event.time;
    state.updateMetrics(clock);

    switch (event.type) {
      case 'ARRIVAL':
        handleArrival(event.request, clock);
        break;
      case 'WASH_ARRIVED':
        handleWashArrived(event.requestId, event.washId, clock);
        break;
      case 'SERVICE_START':
        handleServiceStart(event.requestId, event.washId, clock);
        break;
      case 'SERVICE_COMPLETE':
        handleServiceComplete(event.requestId, event.washId, clock);
        break;
    }
    recordSnapshot();
  }

  // Финальное обновление метрик до конца прогона
  state.updateMetrics(clock);
  // Финальный снапшот только если с момента последнего события прошло заметное время
  if (snapshots.length === 0 || (snapshots[snapshots.length - 1] as SimSnapshot).time !== clock) {
    recordSnapshot();
  }

  return {
    config,
    requests: Array.from(requestsById.values()),
    decisions,
    metrics: aggregateMetrics(requestsById, state, washes, clock),
    washMetrics: collectWashMetrics(state, washes, clock),
    clock,
    snapshots,
  };

  function handleArrival(request: WashRequest, now: SimTime): void {
    state.pruneHistory(now);
    const { decision, record } = dispatcher.dispatch(request, now, {
      getWash: id => state.getWashView(id),
      getHistory: id => state.getHistory(id),
    }, rng);

    decisions.push(record);

    if (decision.washId === null) {
      request.targetWash = null;
      return;
    }

    const wash = washes.find(w => w.id === decision.washId);
    if (!wash) return;
    request.route = input.routePlanner?.plan(request.vehicle, wash);
    const travelMin = request.route
      ? request.route.distanceMeters / ((config.avgSpeedKmh * 1000) / 60)
      : computeTravelTime(wash.coordinates, request.vehicle.location, config);

    request.targetWash = decision.washId;
    request.assignedAt = now;
    state.addInTransit(decision.washId);
    state.addArrivalHistory(decision.washId, now, request.vehicle.type);
    queue.push({
      time: now + travelMin,
      type: 'WASH_ARRIVED',
      requestId: request.id,
      washId: decision.washId,
    });
  }

  function handleWashArrived(requestId: string, washId: string, now: SimTime): void {
    const request = requestsById.get(requestId);
    if (!request || request.targetWash !== washId) return;

    state.removeInTransit(washId);
    request.arrivedAt = now;

    const w = state.getWashView(washId);
    if (w.busyPosts < washes.find(wash => wash.id === washId)!.posts) {
      // Есть свободный пост — сразу начать обслуживание
      queue.push({ time: now, type: 'SERVICE_START', requestId, washId });
    } else {
      state.enqueue(washId, request);
    }
  }

  function handleServiceStart(requestId: string, washId: string, now: SimTime): void {
    const request = requestsById.get(requestId);
    if (!request) return;

    const wash = washes.find(w => w.id === washId)!;
    state.incrementBusy(washId);
    request.startedAt = now;

    const meanService = wash.serviceTimeMin[request.vehicle.type];
    const serviceDuration = rng.exponential(1 / meanService);
    queue.push({
      time: now + serviceDuration,
      type: 'SERVICE_COMPLETE',
      requestId,
      washId,
    });
  }

  function handleServiceComplete(requestId: string, washId: string, now: SimTime): void {
    const request = requestsById.get(requestId);
    if (request) {
      request.completedAt = now;
    }
    state.decrementBusy(washId);
    state.markCompleted(washId);

    const w = state.getWashView(washId);
    const wash = washes.find(wash => wash.id === washId)!;
    if (w.busyPosts < wash.posts) {
      const next = state.dequeue(washId);
      if (next) {
        queue.push({ time: now, type: 'SERVICE_START', requestId: next.id, washId });
      }
    }
  }
}

function computeTravelTime(
  washCoord: [number, number],
  location: [number, number],
  config: SimConfig,
): number {
  const [x1, y1] = location;
  const [x2, y2] = washCoord;
  let distance: number;
  if (config.distanceMetric === 'euclidean') {
    distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  } else {
    distance = Math.abs(x2 - x1) + Math.abs(y2 - y1);
  }
  const speedMetersPerMin = (config.avgSpeedKmh * 1000) / 60;
  return distance / speedMetersPerMin;
}

function collectWashMetrics(
  state: SimulationState,
  washes: readonly CarWash[],
  clock: SimTime,
): Record<string, WashMetrics> {
  const result: Record<string, WashMetrics> = {};
  for (const wash of washes) {
    const m = state.getMetrics(wash.id);
    const denom = clock > 0 ? clock : 1;
    result[wash.id] = {
      assigned: m.assignedCount,
      completed: m.completedCount,
      avgRho: m.totalBusyTime / (wash.posts * denom),
      avgQueueLength: m.totalQueueIntegral / denom,
    };
  }
  return result;
}
