/**
 * Snapshot-рекордер для визуального playback.
 * DES-движок сохраняет состояние после каждого события;
 * UI интерполирует позиции машин между снапшотами.
 */

import type { CarWash, SimTime, WashRequest } from '../domain/types.js';

export interface WashSnapshotData {
  washId: string;
  name: string;
  coordinates: [number, number];
  posts: number;
  queueLength: number;
  busyPosts: number;
  inTransit: number;
  rho: number;
}

export type VehiclePhase = 'future' | 'arrival' | 'transit' | 'queued' | 'busy' | 'done';

export interface VehicleSnapshot {
  id: string;
  type: 'sedan' | 'truck' | 'heavy_truck' | 'bus';
  priority: 'urgent' | 'normal' | 'scheduled';
  phase: VehiclePhase;
  location: [number, number];
  targetWashId: string | null;
  /** Источник нужен визуальному симулятору для объяснения маршрута заявки. */
  sourceId?: string;
}

export interface SimSnapshot {
  time: SimTime;
  washes: WashSnapshotData[];
  vehicles: VehicleSnapshot[];
}

export function buildSnapshot(
  time: SimTime,
  washes: readonly CarWash[],
  state: {
    getWashView(id: string): { queue: readonly WashRequest[]; busyPosts: number; inTransit: number };
    getMetrics(id: string): { totalBusyTime: number; lastUpdateTime: number };
  },
  requestsById: ReadonlyMap<string, WashRequest>,
): SimSnapshot {
  const washSnapshots: WashSnapshotData[] = [];
  const denom = time > 0 ? time : 1;

  for (const wash of washes) {
    const view = state.getWashView(wash.id);
    const metrics = state.getMetrics(wash.id);
    const rho = metrics.totalBusyTime / (wash.posts * denom);
    washSnapshots.push({
      washId: wash.id,
      name: wash.name,
      coordinates: wash.coordinates,
      posts: wash.posts,
      queueLength: view.queue.length,
      busyPosts: view.busyPosts,
      inTransit: view.inTransit,
      rho,
    });
  }

  const vehicles: VehicleSnapshot[] = [];
  for (const request of requestsById.values()) {
    vehicles.push(buildVehicleSnapshot(request, time, washes));
  }

  return { time, washes: washSnapshots, vehicles };
}

function buildVehicleSnapshot(
  request: WashRequest,
  time: SimTime,
  washes: readonly CarWash[],
): VehicleSnapshot {
  const { vehicle } = request;

  if (time < vehicle.arrivalTime) {
    return { id: request.id, type: vehicle.type, priority: vehicle.priority, phase: 'future', location: vehicle.location, targetWashId: null, sourceId: vehicle.source?.id };
  }

  if (request.targetWash === null) {
    // Отказ — машина остаётся на точке появления
    return { id: request.id, type: vehicle.type, priority: vehicle.priority, phase: 'done', location: vehicle.location, targetWashId: null, sourceId: vehicle.source?.id };
  }

  const wash = washes.find(w => w.id === request.targetWash);
  if (!wash) {
    return { id: request.id, type: vehicle.type, priority: vehicle.priority, phase: 'done', location: vehicle.location, targetWashId: request.targetWash, sourceId: vehicle.source?.id };
  }

  if (request.completedAt !== undefined && time >= request.completedAt) {
    return { id: request.id, type: vehicle.type, priority: vehicle.priority, phase: 'done', location: wash.coordinates, targetWashId: request.targetWash, sourceId: vehicle.source?.id };
  }

  if (request.startedAt !== undefined && time >= request.startedAt) {
    return { id: request.id, type: vehicle.type, priority: vehicle.priority, phase: 'busy', location: wash.coordinates, targetWashId: request.targetWash, sourceId: vehicle.source?.id };
  }

  if (request.arrivedAt !== undefined && time >= request.arrivedAt) {
    return { id: request.id, type: vehicle.type, priority: vehicle.priority, phase: 'queued', location: wash.coordinates, targetWashId: request.targetWash, sourceId: vehicle.source?.id };
  }

  // В пути: интерполяция от точки появления к мойке
  const route = request.route;
  const start = vehicle.location;
  const end = wash.coordinates;
  const assignedAt = request.assignedAt;
  const travelEnd = request.arrivedAt ?? time;
  const travelDuration = Math.max(travelEnd - assignedAt, 1e-6);
  const progress = Math.min(Math.max((time - assignedAt) / travelDuration, 0), 1);
  const location = route ? interpolateRoute(route.points, progress) : [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
  ] as [number, number];

  return { id: request.id, type: vehicle.type, priority: vehicle.priority, phase: 'transit', location, targetWashId: request.targetWash, sourceId: vehicle.source?.id };
}

function interpolateRoute(points: readonly { coordinates: [number, number] }[], progress: number): [number, number] {
  if (points.length < 2) return points[0]?.coordinates ?? [0, 0];
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.coordinates[0] - points[index]!.coordinates[0], point.coordinates[1] - points[index]!.coordinates[1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = progress * total;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (remaining <= length || i === lengths.length - 1) {
      const from = points[i]!.coordinates;
      const to = points[i + 1]!.coordinates;
      const part = length > 0 ? remaining / length : 0;
      return [from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part];
    }
    remaining -= length;
  }
  return points[points.length - 1]!.coordinates;
}
