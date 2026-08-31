import { describe, expect, it } from 'vitest';
import { Dispatcher, createAlgorithm, generateArrivals, mulberry32, runSimulation } from '../src/index.js';
import type { CarWash, SimConfig, VehicleType } from '../src/index.js';

const WASHES: CarWash[] = [
  {
    id: 'wash_a',
    name: 'Мойка A',
    coordinates: [1000, 2000],
    posts: 3,
    serviceTimeMin: { sedan: 8, truck: 25, heavy_truck: 38, bus: 40 },
    supportedTypes: ['sedan', 'truck'],
    isActive: true,
    schedule: { openHour: 0, closeHour: 24 },
  },
  {
    id: 'wash_b',
    name: 'Мойка B',
    coordinates: [5000, 3000],
    posts: 4,
    serviceTimeMin: { sedan: 10, truck: 30, heavy_truck: 45, bus: 40 },
    supportedTypes: ['sedan', 'truck', 'heavy_truck', 'bus'],
    isActive: true,
    schedule: { openHour: 0, closeHour: 24 },
  },
  {
    id: 'wash_c',
    name: 'Мойка C',
    coordinates: [2000, 5000],
    posts: 2,
    serviceTimeMin: { sedan: 6, truck: 20, heavy_truck: 32, bus: 35 },
    supportedTypes: ['sedan'],
    isActive: true,
    schedule: { openHour: 0, closeHour: 24 },
  },
];

const TYPE_SHARES: Record<VehicleType, number> = { sedan: 0.55, truck: 0.22, heavy_truck: 0.08, bus: 0.15 };

function makeConfig(algorithm: string, seed: number): SimConfig {
  return {
    seed,
    algorithm,
    distanceMetric: 'manhattan',
    avgSpeedKmh: 20,
    timeScale: 1,
  };
}

function createArrivals(seed: number) {
  return generateArrivals(
    {
      lambdaBasePerMin: 0.2,
      horizonMin: 240,
      gridSizeMeters: 6000,
      typeShares: TYPE_SHARES,
    },
    mulberry32(seed),
  );
}

function run(config: SimConfig) {
  return runSimulation(
    { washes: WASHES, config, arrivals: createArrivals(config.seed) },
    (washes, cfg, rng) => new Dispatcher(washes, cfg, createAlgorithm(cfg.algorithm)),
  );
}

describe('DES-движок', () => {
  it('детерминирован: два прогона с одним seed дают идентичные решения', () => {
    const config = makeConfig('jsq', 123);
    const a = run(config);
    const b = run(config);
    expect(a.metrics.totalRequests).toBe(b.metrics.totalRequests);
    expect(a.decisions.map(d => d.chosenWash)).toEqual(b.decisions.map(d => d.chosenWash));
  });

  it('несовместимые ТС не назначаются (грузовик/автобус на мойку C)', () => {
    const config = makeConfig('weighted_jsq', 7);
    const result = run(config);
    for (const decision of result.decisions) {
      if (decision.vehicleType !== 'sedan') {
        expect(decision.chosenWash).not.toBe('wash_c');
      }
    }
  });

  it('Weighted JSQ не уступает Random по целевой функции', () => {
    const seed = 99;
    const random = run(makeConfig('random', seed));
    const wjsq = run(makeConfig('weighted_jsq', seed));

    const objRandom = 0.5 * random.metrics.avgWaitMin + 0.3 * random.metrics.avgTravelMin + 0.2 * random.metrics.cvRho;
    const objWjsq = 0.5 * wjsq.metrics.avgWaitMin + 0.3 * wjsq.metrics.avgTravelMin + 0.2 * wjsq.metrics.cvRho;

    expect(objWjsq).toBeLessThanOrEqual(objRandom + 1e-6);
  });

  it('JSQ учитывает n_transit при выборе', () => {
    const seed = 11;
    const jsq = run(makeConfig('jsq', seed));
    // проверяем, что хотя бы одно решение отличается от Random, т.е. queue/busy/inTransit влияют
    const random = run(makeConfig('random', seed));
    const diffCount = jsq.decisions.filter((d, i) => d.chosenWash !== random.decisions[i]?.chosenWash).length;
    expect(diffCount).toBeGreaterThan(0);
  });
});
