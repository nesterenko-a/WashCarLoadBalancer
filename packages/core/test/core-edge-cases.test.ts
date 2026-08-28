import { describe, expect, it } from 'vitest';
import {
  Dispatcher,
  createAlgorithm,
  effectiveMu,
  erlangC,
  generateArrivals,
  mulberry32,
  runSimulation,
  type CarWash,
  type SimConfig,
  type VehicleType,
} from '../src/index.js';
import { EventQueue } from '../src/sim/eventQueue.js';
import { SimulationState } from '../src/sim/state.js';

const TYPE_SHARES: Record<VehicleType, number> = { sedan: 0.6, truck: 0.3, bus: 0.1 };

function createArrivals(seed: number) {
  return generateArrivals(
    { lambdaBasePerMin: 0.2, horizonMin: 120, gridSizeMeters: 6000, typeShares: TYPE_SHARES },
    mulberry32(seed),
  );
}

const WASHES: CarWash[] = [
  {
    id: 'wash_a',
    name: 'Мойка A',
    coordinates: [1000, 2000],
    posts: 3,
    serviceTimeMin: { sedan: 8, truck: 25, bus: 40 },
    supportedTypes: ['sedan', 'truck'],
    isActive: true,
    schedule: { openHour: 0, closeHour: 24 },
  },
  {
    id: 'wash_b',
    name: 'Мойка B',
    coordinates: [5000, 3000],
    posts: 4,
    serviceTimeMin: { sedan: 10, truck: 30, bus: 40 },
    supportedTypes: ['sedan', 'truck', 'bus'],
    isActive: true,
    schedule: { openHour: 0, closeHour: 24 },
  },
];

function makeConfig(algorithm: string, seed: number, metric: 'manhattan' | 'euclidean' = 'manhattan'): SimConfig {
  return {
    seed,
    algorithm,
    distanceMetric: metric,
    avgSpeedKmh: 20,
    timeScale: 1,
  };
}

function run(config: SimConfig, washes = WASHES) {
  return runSimulation(
    {
      washes,
      config,
      arrivals: generateArrivals(
        { lambdaBasePerMin: 0.2, horizonMin: 120, gridSizeMeters: 6000, typeShares: TYPE_SHARES },
        mulberry32(config.seed),
      ),
    },
    (w, c, rng) => new Dispatcher(w, c, createAlgorithm(c.algorithm)),
  );
}

describe('PRNG', () => {
  it('sample возвращает заданное число элементов', () => {
    const rng = mulberry32(1);
    const arr = [1, 2, 3, 4, 5];
    const s = rng.sample(arr, 3);
    expect(s).toHaveLength(3);
    expect(new Set(s).size).toBe(3);
  });

  it('sample бросает, если n больше массива', () => {
    const rng = mulberry32(2);
    expect(() => rng.sample([1, 2], 5)).toThrow();
  });

  it('exponential бросает при неположительном rate', () => {
    const rng = mulberry32(3);
    expect(() => rng.exponential(0)).toThrow();
    expect(() => rng.exponential(-1)).toThrow();
  });
});

describe('EventQueue', () => {
  it('pop и peek возвращают undefined для пустой очереди', () => {
    const q = new EventQueue<{ time: number }>();
    expect(q.pop()).toBeUndefined();
    expect(q.peek()).toBeUndefined();
    expect(q.length).toBe(0);
  });

  it('сохраняет порядок по времени', () => {
    const q = new EventQueue<{ time: number; id: number }>();
    q.push({ time: 5, id: 1 });
    q.push({ time: 1, id: 2 });
    q.push({ time: 3, id: 3 });
    expect(q.pop()?.id).toBe(2);
    expect(q.pop()?.id).toBe(3);
    expect(q.pop()?.id).toBe(1);
  });
});

describe('Erlang C', () => {
  it('effectiveMu бросает при нулевом среднем времени обслуживания', () => {
    expect(() => effectiveMu({ sedan: 0, truck: 0, bus: 0 }, { sedan: 0.5, truck: 0.3, bus: 0.2 })).toThrow();
  });

  it('erlangC покрывает ветку rho >= 1', () => {
    expect(erlangC(100, 1, 2)).toBe(1);
  });
});

describe('SimulationState', () => {
  it('бросает при обращении к неизвестной мойке', () => {
    const state = new SimulationState(WASHES);
    expect(() => state.getWashView('unknown')).toThrow();
    expect(() => state.getHistory('unknown')).toThrow();
    expect(() => state.getMetrics('unknown')).toThrow();
  });
});

describe('Диспетчер', () => {
  it('computeShares корректно обрабатывает пустой массив типов', () => {
    const disp = new Dispatcher(WASHES, makeConfig('jsq', 1), createAlgorithm('jsq'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shares = (disp as any).computeShares([]);
    expect(shares).toEqual({ sedan: 0, truck: 0, bus: 0 });
  });

  it('неактивные и несовместимые мойки отфильтровываются и логируются', () => {
    const washes: CarWash[] = [
      { ...WASHES[0]!, isActive: false },
      { ...WASHES[1]! },
    ];
    const result = run(makeConfig('jsq', 7), washes);
    expect(result.decisions.length).toBeGreaterThan(0);
    const withReason = result.decisions.filter(d => d.rejectedReason.includes('inactive'));
    expect(withReason.length).toBeGreaterThan(0);
  });

  it('euclidean distance metric покрывается', () => {
    const result = run(makeConfig('weighted_jsq', 9, 'euclidean'));
    expect(result.metrics.totalRequests).toBeGreaterThan(0);
  });

  it('при отсутствии моек все заявки получают отказ', () => {
    const result = run(makeConfig('jsq', 13), []);
    expect(result.metrics.rejected).toBe(result.metrics.totalRequests);
    expect(result.metrics.totalRequests).toBeGreaterThan(0);
  });
});

describe('Алгоритмы', () => {
  it('createAlgorithm бросает на неизвестном имени', () => {
    expect(() => createAlgorithm('unknown')).toThrow();
  });

  it('алгоритмы возвращают null при пустом списке кандидатов', () => {
    for (const name of ['random', 'jsq', 'weighted_jsq']) {
      const algo = createAlgorithm(name);
      const decision = algo.decide({
        request: { id: 'R1', vehicle: { id: 'V1', type: 'sedan', priority: 'normal', arrivalTime: 0, location: [0, 0] }, targetWash: null, algorithm: name, assignedAt: 0 },
        candidates: [],
        now: 0,
        rng: mulberry32(1),
      });
      expect(decision.washId).toBeNull();
      expect(Object.keys(decision.scores)).toHaveLength(0);
    }
  });
});

describe('DES-движок', () => {
  it('пустой поток arrivals даёт нулевые метрики', () => {
    const result = runSimulation(
      { washes: WASHES, config: makeConfig('jsq', 1), arrivals: [] },
      (w, c, rng) => new Dispatcher(w, c, createAlgorithm(c.algorithm)),
    );
    expect(result.metrics.totalRequests).toBe(0);
    expect(result.metrics.avgWaitMin).toBe(0);
    expect(result.metrics.avgRho).toBe(0);
  });

  it('генератор с нулевой интенсивностью возвращает пустой массив', () => {
    const arrivals = generateArrivals(
      { lambdaBasePerMin: 0, horizonMin: 60, gridSizeMeters: 1000, typeShares: TYPE_SHARES },
      mulberry32(1),
    );
    expect(arrivals).toHaveLength(0);
  });
});

describe('Snapshot-рекордер', () => {
  it('сохраняет снапшоты при recordSnapshots=true', () => {
    const result = runSimulation(
      { washes: WASHES, config: makeConfig('jsq', 1, 'manhattan'), arrivals: createArrivals(1), recordSnapshots: true },
      (w, c, rng) => new Dispatcher(w, c, createAlgorithm(c.algorithm)),
    );
    expect(result.snapshots.length).toBeGreaterThan(0);
    expect(result.snapshots[0].time).toBe(0);
    const first = result.snapshots[0];
    expect(first.washes).toHaveLength(WASHES.length);
    expect(first.vehicles.length).toBe(result.metrics.totalRequests);
  });

  it('детерминирован: одинаковые snapshots при одном seed', () => {
    const a = runSimulation(
      { washes: WASHES, config: makeConfig('jsq', 7, 'manhattan'), arrivals: createArrivals(7), recordSnapshots: true },
      (w, c, rng) => new Dispatcher(w, c, createAlgorithm(c.algorithm)),
    );
    const b = runSimulation(
      { washes: WASHES, config: makeConfig('jsq', 7, 'manhattan'), arrivals: createArrivals(7), recordSnapshots: true },
      (w, c, rng) => new Dispatcher(w, c, createAlgorithm(c.algorithm)),
    );
    expect(a.snapshots.length).toBe(b.snapshots.length);
    for (let i = 0; i < a.snapshots.length; i++) {
      expect(a.snapshots[i].time).toBe(b.snapshots[i].time);
      expect(a.snapshots[i].vehicles.map(v => v.phase)).toEqual(b.snapshots[i].vehicles.map(v => v.phase));
    }
  });

  it('пустой поток даёт один финальный снапшот', () => {
    const result = runSimulation(
      { washes: WASHES, config: makeConfig('jsq', 1), arrivals: [], recordSnapshots: true },
      (w, c, rng) => new Dispatcher(w, c, createAlgorithm(c.algorithm)),
    );
    expect(result.snapshots.length).toBe(1);
    expect(result.snapshots[0].time).toBe(0);
  });
});
