/**
 * Генератор синтетических arrivals (Приложение Б спецификации).
 * Нестационарный Пуассоновский процесс с суточным профилем, thinning-метод Льюиса.
 * Все случайности — через seeded PRNG (NF-10).
 */

import type { Rng } from '../rng/mulberry32.js';
import type { SimTime, Vehicle, VehicleType } from '../domain/types.js';

/** Доля от базового λ_base для каждого часа суток. */
const HOURLY_PROFILE: readonly number[] = [
  0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, // 00–06
  2.5, 2.5, 2.5, // 07–09
  1.0, 1.0, // 10–11
  0.5, // 12
  1.0, 1.0, 1.0, // 13–15
  2.0, 2.0, 2.0, // 16–18
  0.4, 0.4, 0.4, 0.4, // 19–23
];

export interface ArrivalGeneratorConfig {
  /** Базовая интенсивность заявок в минуту. */
  lambdaBasePerMin: number;
  /** Продолжительность прогона в минутах. */
  horizonMin: number;
  /** Размер территории в метрах (0..size). */
  gridSizeMeters: number;
  /** Доли типов ТС. */
  typeShares: Record<VehicleType, number>;
}

export function generateArrivals(
  config: ArrivalGeneratorConfig,
  rng: Rng,
): Vehicle[] {
  const { lambdaBasePerMin, horizonMin, gridSizeMeters, typeShares } = config;
  const lambdaMax = lambdaBasePerMin * Math.max(...HOURLY_PROFILE);
  if (lambdaMax <= 0) return [];

  const arrivals: Vehicle[] = [];
  let t = 0;

  // Thinning-метод Льюиса
  while (true) {
    t += rng.exponential(lambdaMax);
    if (t >= horizonMin) break;
    if (rng.next() < arrivalRateAt(t, lambdaBasePerMin) / lambdaMax) {
      arrivals.push(createVehicle(t, gridSizeMeters, typeShares, rng, arrivals.length));
    }
  }

  return arrivals;
}

function arrivalRateAt(timeMin: number, lambdaBasePerMin: number): number {
  const hour = Math.min(Math.floor(timeMin / 60), 23);
  return lambdaBasePerMin * (HOURLY_PROFILE[hour] ?? 0);
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
