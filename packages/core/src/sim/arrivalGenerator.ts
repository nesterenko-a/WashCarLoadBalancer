/**
 * Генератор синтетических arrivals (Приложение Б спецификации).
 * Нестационарный Пуассоновский процесс с настраиваемыми пиковыми окнами,
 * thinning-метод Льюиса. Все случайности — через seeded PRNG (NF-10).
 */

import type { Rng } from '../rng/mulberry32.js';
import type { Priority, SimTime, Vehicle, VehicleSource, VehicleType } from '../domain/types.js';

export interface PeakWindow {
  startHour: number; // включительно
  endHour: number;   // не включительно
  factor: number;    // во сколько раз усилить поток
}

export interface ArrivalGeneratorConfig {
  /** Базовая интенсивность заявок в минуту. */
  lambdaBasePerMin: number;
  /** Продолжительность прогона в минутах. */
  horizonMin: number;
  /** Размер территории в метрах (0..size). */
  gridSizeMeters: number;
  /** Доли типов ТС. */
  typeShares: Record<VehicleType, number>;
  /** Доли приоритетов; по умолчанию 5% срочных, 80% обычных, 15% плановых. */
  priorityShares?: Record<Priority, number>;
  /** Пиковые окна нагрузки. */
  peakWindows?: readonly PeakWindow[];
  /**
   * Источники заявок на территории. При отсутствии сохраняется прежнее
   * равномерное появление на карте — для обратной совместимости сценариев.
   */
  sources?: readonly VehicleSource[];
  /** Относительные доли источников; при отсутствии источники выбираются поровну. */
  sourceShares?: Record<string, number>;
}

const DEFAULT_PEAKS: readonly PeakWindow[] = [
  { startHour: 12, endHour: 13, factor: 3.0 },
  { startHour: 17, endHour: 18, factor: 3.0 },
];
const DEFAULT_PRIORITY_SHARES: Record<Priority, number> = { urgent: .05, normal: .8, scheduled: .15 };

export function generateArrivals(
  config: ArrivalGeneratorConfig,
  rng: Rng,
): Vehicle[] {
  const { lambdaBasePerMin, horizonMin, gridSizeMeters, typeShares, priorityShares = DEFAULT_PRIORITY_SHARES, peakWindows = DEFAULT_PEAKS, sources = [], sourceShares } = config;
  const lambdaMax = lambdaBasePerMin * maxRateMultiplier(peakWindows);
  if (lambdaMax <= 0) return [];

  const arrivals: Vehicle[] = [];
  let t = 0;

  // Thinning-метод Льюиса
  while (true) {
    t += rng.exponential(lambdaMax);
    if (t >= horizonMin) break;
    if (rng.next() < arrivalRateAt(t, lambdaBasePerMin, peakWindows) / lambdaMax) {
      arrivals.push(createVehicle(t, gridSizeMeters, typeShares, priorityShares, sources, sourceShares, rng, arrivals.length));
    }
  }

  return arrivals;
}

function maxRateMultiplier(peakWindows: readonly PeakWindow[]): number {
  let max = 1;
  for (let hour = 0; hour < 24; hour++) {
    max = Math.max(max, multiplierAt(hour, peakWindows));
  }
  return max;
}

function arrivalRateAt(
  timeMin: number,
  lambdaBasePerMin: number,
  peakWindows: readonly PeakWindow[],
): number {
  const hour = Math.min(Math.floor(timeMin / 60), 23);
  return lambdaBasePerMin * multiplierAt(hour, peakWindows);
}

function multiplierAt(hour: number, peakWindows: readonly PeakWindow[]): number {
  let m = 1;
  for (const peak of peakWindows) {
    if (hour >= peak.startHour && hour < peak.endHour) {
      m *= peak.factor;
    }
  }
  return m;
}

function createVehicle(
  t: SimTime,
  gridSize: number,
  shares: Record<VehicleType, number>,
  priorityShares: Record<Priority, number>,
  sources: readonly VehicleSource[],
  sourceShares: Record<string, number> | undefined,
  rng: Rng,
  index: number,
): Vehicle {
  const source = sampleSource(sources, sourceShares, rng);
  return {
    id: `V${index.toString().padStart(5, '0')}`,
    type: sampleType(shares, rng),
    priority: samplePriority(priorityShares, rng),
    arrivalTime: t,
    location: source ? source.coordinates : [rng.next() * gridSize, rng.next() * gridSize],
    source,
  };
}

function sampleSource(sources: readonly VehicleSource[], shares: Record<string, number> | undefined, rng: Rng): VehicleSource | undefined {
  if (sources.length === 0) return undefined;
  const weights = sources.map(source => Math.max(0, shares?.[source.id] ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return sources[Math.floor(rng.next() * sources.length)];
  let threshold = rng.next() * total;
  for (let index = 0; index < sources.length; index += 1) {
    threshold -= weights[index]!;
    if (threshold < 0) return sources[index]!;
  }
  return sources[sources.length - 1]!;
}

function sampleType(shares: Record<VehicleType, number>, rng: Rng): VehicleType {
  const r = rng.next();
  let acc = 0;
  for (const type of ['sedan', 'truck', 'heavy_truck', 'bus'] as VehicleType[]) {
    acc += shares[type];
    if (r < acc) return type;
  }
  return 'bus';
}

function samplePriority(shares: Record<Priority, number>, rng: Rng): Priority {
  const r = rng.next();
  if (r < shares.urgent) return 'urgent';
  if (r < shares.urgent + shares.normal) return 'normal';
  return 'scheduled';
}
