/**
 * Состояние моек во время симуляции.
 * Хранит очереди, занятые посты, машины в пути (n_transit),
 * историю поступлений за 15 минут (для оценки λ и ρ).
 */

import type { CarWash, SimTime, VehicleType, WashRequest } from '../domain/types.js';

const HISTORY_WINDOW_MIN = 15;
const PRIORITY_RANK = { urgent: 0, normal: 1, scheduled: 2 } as const;

export interface WashRuntimeMetrics {
  totalBusyTime: number; // минуты · посты
  totalQueueIntegral: number; // минуты · машины
  lastUpdateTime: number;
  completedCount: number;
  assignedCount: number;
}

export class SimulationState {
  private readonly washes: Map<string, {
    queue: WashRequest[];
    busyPosts: number;
    inTransit: number;
    history: { times: number[]; types: VehicleType[] };
    metrics: WashRuntimeMetrics;
  }>;

  constructor(washes: readonly CarWash[]) {
    this.washes = new Map();
    for (const wash of washes) {
      this.washes.set(wash.id, {
        queue: [],
        busyPosts: 0,
        inTransit: 0,
        history: { times: [], types: [] as VehicleType[] },
        metrics: {
          totalBusyTime: 0,
          totalQueueIntegral: 0,
          lastUpdateTime: 0,
          completedCount: 0,
          assignedCount: 0,
        },
      });
    }
  }

  getWashView(id: string) {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    return {
      queue: w.queue as readonly WashRequest[],
      busyPosts: w.busyPosts,
      inTransit: w.inTransit,
    };
  }

  getHistory(id: string) {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    return { times: w.history.times, types: w.history.types };
  }

  getMetrics(id: string): WashRuntimeMetrics {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    return { ...w.metrics };
  }

  ids(): string[] {
    return Array.from(this.washes.keys());
  }

  enqueue(id: string, request: WashRequest): void {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    // Без preemption: уже начатая мойка не прерывается. При освобождении поста
    // срочная заявка занимает место перед менее приоритетными, FIFO сохраняется
    // внутри каждого класса приоритета.
    const position = w.queue.findIndex(item => PRIORITY_RANK[item.vehicle.priority] > PRIORITY_RANK[request.vehicle.priority]);
    if (position === -1) w.queue.push(request);
    else w.queue.splice(position, 0, request);
  }

  dequeue(id: string): WashRequest | undefined {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    return w.queue.shift();
  }

  addInTransit(id: string): void {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    w.inTransit++;
    w.metrics.assignedCount++;
  }

  removeInTransit(id: string): void {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    w.inTransit--;
  }

  incrementBusy(id: string): void {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    w.busyPosts++;
  }

  decrementBusy(id: string): void {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    w.busyPosts--;
  }

  addArrivalHistory(id: string, now: SimTime, type: VehicleType): void {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    w.history.times.push(now);
    w.history.types.push(type);
  }

  pruneHistory(now: SimTime): void {
    const cutoff = now - HISTORY_WINDOW_MIN;
    for (const w of this.washes.values()) {
      let idx = 0;
      while (idx < w.history.times.length && (w.history.times[idx] as number) <= cutoff) idx++;
      if (idx > 0) {
        w.history.times = w.history.times.slice(idx);
        w.history.types = w.history.types.slice(idx);
      }
    }
  }

  /**
   * Обновляет time-weighted метрики для всех моек (busyTime и queueIntegral).
   * Вызывается при каждом изменении состояния.
   */
  updateMetrics(now: SimTime): void {
    for (const w of this.washes.values()) {
      const dt = now - w.metrics.lastUpdateTime;
      if (dt <= 0) continue;
      w.metrics.totalBusyTime += w.busyPosts * dt;
      w.metrics.totalQueueIntegral += w.queue.length * dt;
      w.metrics.lastUpdateTime = now;
    }
  }

  markCompleted(id: string): void {
    const w = this.washes.get(id);
    if (!w) throw new Error(`Unknown wash: ${id}`);
    w.metrics.completedCount++;
  }
}
