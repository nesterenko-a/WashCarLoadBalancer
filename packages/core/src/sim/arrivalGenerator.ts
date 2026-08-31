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
  const { lambdaBasePerMin, horizonMin, gridSizeMeters, typeShares, priorityShares = DEFAULT_PRIORITY_SHARES, peakWindows = DEFAULT_PEAKS, sources = [] } = config;
  const lambdaMax = lambdaBasePerMin * maxRateMultiplier(peakWindows);
  if (lambdaMax <= 0) return [];

  const arrivals: Vehicle[] = [];
  let t = 0;

  // Thinning-метод Льюиса
  while (true) {
    t += rng.exponential(lambdaMax);
    if (t >= horizonMin) break;
    if (rng.next() < arrivalRateAt(t, lambdaBasePerMin, peakWindows) / lambdaMax) {
      arrivals.push(createVehicle(t, gridSizeMeters, typeShares, priorityShares, sources, rng, arrivals.length));
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
  rng: Rng,
  index: number,
): Vehicle {
  const source = sources.length > 0 ? sources[Math.floor(rng.next() * sources.length)] : undefined;
  return {
    id: `V${index.toString().padStart(5, '0')}`,
    type: sampleType(shares, rng),
    priority: samplePriority(priorityShares, rng),
    arrivalTime: t,
    location: source ? source.coordinates : [rng.next() * gridSize, rng.next() * gridSize],
    source,
  };
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
