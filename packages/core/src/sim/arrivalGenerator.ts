/**
 * Генератор синтетических arrivals (Приложение Б спецификации).
 * Нестационарный Пуассоновский процесс с настраиваемыми пиковыми окнами,
 * thinning-метод Льюиса. Все случайности — через seeded PRNG (NF-10).
 */

import type { Rng } from '../rng/mulberry32.js';
import type { SimTime, Vehicle, VehicleType } from '../domain/types.js';

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
  /** Пиковые окна нагрузки. */
  peakWindows?: readonly PeakWindow[];
}

const DEFAULT_PEAKS: readonly PeakWindow[] = [
  { startHour: 12, endHour: 13, factor: 3.0 },
  { startHour: 17, endHour: 18, factor: 3.0 },
];

export function generateArrivals(
  config: ArrivalGeneratorConfig,
  rng: Rng,
): Vehicle[] {
  const { lambdaBasePerMin, horizonMin, gridSizeMeters, typeShares, peakWindows = DEFAULT_PEAKS } = config;
  const lambdaMax = lambdaBasePerMin * maxRateMultiplier(peakWindows);
  if (lambdaMax <= 0) return [];

  const arrivals: Vehicle[] = [];
  let t = 0;

  // Thinning-метод Льюиса
  while (true) {
    t += rng.exponential(lambdaMax);
    if (t >= horizonMin) break;
    if (rng.next() < arrivalRateAt(t, lambdaBasePerMin, peakWindows) / lambdaMax) {
      arrivals.push(createVehicle(t, gridSizeMeters, typeShares, rng, arrivals.length));
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
  rng: Rng,
  index: number,
): Vehicle {
  return {
    id: `V${index.toString().padStart(5, '0')}`,
    type: sampleType(shares, rng),
    priority: samplePriority(rng),
    arrivalTime: t,
    location: [rng.next() * gridSize, rng.next() * gridSize],
  };
}

function sampleType(shares: Record<VehicleType, number>, rng: Rng): VehicleType {
  const r = rng.next();
  let acc = 0;
  for (const type of ['sedan', 'truck', 'bus'] as VehicleType[]) {
    acc += shares[type];
    if (r < acc) return type;
  }
  return 'bus';
}

function samplePriority(rng: Rng): 'urgent' | 'normal' | 'scheduled' {
  const r = rng.next();
  if (r < 0.05) return 'urgent';
  if (r < 0.85) return 'normal';
  return 'scheduled';
}
