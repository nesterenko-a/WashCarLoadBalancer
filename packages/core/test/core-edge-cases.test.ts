import { describe, expect, it } from 'vitest';
import {
  Dispatcher,
  createAlgorithm,
  createRoadGraphPlanner,
  effectiveMu,
  erlangC,
  generateArrivals,
  mulberry32,
  runSimulation,
  type CarWash,
  type SimConfig,
  type VehicleSource,
  type VehicleType,
} from '../src/index.js';
import { EventQueue } from '../src/sim/eventQueue.js';
import { SimulationState } from '../src/sim/state.js';

const TYPE_SHARES: Record<VehicleType, number> = { sedan: 0.55, truck: 0.22, heavy_truck: 0.08, bus: 0.15 };

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

describe('Источники заявок', () => {
  it('генератор назначает источник из заданного списка детерминированно', () => {
    const sources: VehicleSource[] = [
      { id: 'entrance', name: 'Въезд', kind: 'entrance', coordinates: [0, 0] },
      { id: 'shop_1', name: 'Цех №1', kind: 'workshop', coordinates: [100, 200] },
    ];
    const config = { lambdaBasePerMin: 0.5, horizonMin: 60, gridSizeMeters: 1000, typeShares: TYPE_SHARES, sources };
    const first = generateArrivals(config, mulberry32(123));
    const second = generateArrivals(config, mulberry32(123));

    expect(first.length).toBeGreaterThan(0);
    expect(first.map(v => v.source?.id)).toEqual(second.map(v => v.source?.id));
    expect(first.every(v => v.source !== undefined && v.location === v.source.coordinates)).toBe(true);
  });

  it('генератор учитывает заданное распределение приоритетов', () => {
    const arrivals = generateArrivals(
      { lambdaBasePerMin: 1, horizonMin: 30, gridSizeMeters: 1000, typeShares: TYPE_SHARES, priorityShares: { urgent: 1, normal: 0, scheduled: 0 } },
      mulberry32(123),
    );
    expect(arrivals.length).toBeGreaterThan(0);
    expect(arrivals.every(vehicle => vehicle.priority === 'urgent')).toBe(true);
  });
});

describe('RoutePlanner', () => {
  it('выбирает кратчайший путь по рёбрам графа, а не ближайшую по прямой мойку', () => {
    const planner = createRoadGraphPlanner({
      nodes: [
        { id: 'shop_1', coordinates: [0, 0] },
        { id: 'junction', coordinates: [0, 10] },
        { id: 'wash_a', coordinates: [10, 0] },
        { id: 'wash_b', coordinates: [0, 20] },
      ],
      edges: [
        { from: 'shop_1', to: 'junction', distanceMeters: 10 },
        { from: 'junction', to: 'wash_b', distanceMeters: 10 },
        { from: 'shop_1', to: 'wash_a', distanceMeters: 100 },
      ],
    });
    const vehicle = { id: 'V1', type: 'sedan' as const, priority: 'normal' as const, arrivalTime: 0, location: [0, 0] as [number, number], source: { id: 'shop_1', name: 'Цех №1', kind: 'workshop' as const, coordinates: [0, 0] as [number, number] } };
    const wash = { ...WASHES[1]!, id: 'wash_b', coordinates: [0, 20] as [number, number] };

    const route = planner.plan(vehicle, wash);
    expect(route.distanceMeters).toBe(20);
    expect(route.points.map(point => point.id)).toEqual(['shop_1', 'junction', 'wash_b']);
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
    expect(() => effectiveMu({ sedan: 0, truck: 0, heavy_truck: 0, bus: 0 }, { sedan: 0.5, truck: 0.2, heavy_truck: 0.1, bus: 0.2 })).toThrow();
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

  it('обслуживает срочные заявки раньше обычных и плановых, сохраняя FIFO внутри приоритета', () => {
    const state = new SimulationState(WASHES);
    const request = (id: string, priority: 'urgent' | 'normal' | 'scheduled') => ({ id, vehicle: { id, type: 'sedan' as const, priority, arrivalTime: 0, location: [0, 0] as [number, number] }, targetWash: 'wash_a', algorithm: 'jsq', assignedAt: 0 });
    state.enqueue('wash_a', request('scheduled', 'scheduled'));
    state.enqueue('wash_a', request('normal-1', 'normal'));
    state.enqueue('wash_a', request('urgent', 'urgent'));
    state.enqueue('wash_a', request('normal-2', 'normal'));
    expect([state.dequeue('wash_a')?.id, state.dequeue('wash_a')?.id, state.dequeue('wash_a')?.id, state.dequeue('wash_a')?.id]).toEqual(['urgent', 'normal-1', 'normal-2', 'scheduled']);
  });
});

describe('Диспетчер', () => {
  it('сохраняет детали кандидатов для объяснения решения', () => {
    const result = run(makeConfig('weighted_jsq', 17));
    const decision = result.decisions.find(item => item.chosenWash !== null);
    expect(decision).toBeDefined();
    expect(decision!.candidates.length).toBeGreaterThan(0);
    expect(decision!.candidates.every(candidate => Number.isFinite(candidate.travelTimeMin) && Number.isFinite(candidate.score))).toBe(true);
  });

  it('computeShares корректно обрабатывает пустой массив типов', () => {
    const disp = new Dispatcher(WASHES, makeConfig('jsq', 1), createAlgorithm('jsq'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shares = (disp as any).computeShares([]);
    expect(shares).toEqual({ sedan: 0, truck: 0, heavy_truck: 0, bus: 0 });
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

  it('Power of Two детерминированно выбирает из двух случайных кандидатов', () => {
    const ctx = {
      request: { id: 'R1', vehicle: { id: 'V1', type: 'sedan' as const, priority: 'normal' as const, arrivalTime: 0, location: [0, 0] as [number, number] }, targetWash: null, algorithm: 'power_of_two', assignedAt: 0 },
      candidates: [
        { washId: 'a', queueLength: 4, busyPosts: 1, totalPosts: 2, inTransit: 0, serviceTimeMin: WASHES[0]!.serviceTimeMin, rho: .5, expectedWaitMin: 3, travelTimeMin: 2 },
        { washId: 'b', queueLength: 2, busyPosts: 1, totalPosts: 2, inTransit: 0, serviceTimeMin: WASHES[1]!.serviceTimeMin, rho: .5, expectedWaitMin: 3, travelTimeMin: 2 },
        { washId: 'c', queueLength: 0, busyPosts: 1, totalPosts: 2, inTransit: 0, serviceTimeMin: WASHES[1]!.serviceTimeMin, rho: .5, expectedWaitMin: 3, travelTimeMin: 2 },
      ],
      now: 0,
      rng: mulberry32(42),
    };
    const decision = createAlgorithm('power_of_two').decide(ctx);
    expect(decision.consideredWashIds).toHaveLength(2);
    expect(decision.consideredWashIds).toContain(decision.washId);
    expect(createAlgorithm('power_of_two').decide({ ...ctx, rng: mulberry32(42) })).toEqual(decision);
  });

  it('State-Aware Score штрафует перегруженную мойку', () => {
    const decision = createAlgorithm('state_aware').decide({
      request: { id: 'R1', vehicle: { id: 'V1', type: 'sedan', priority: 'normal', arrivalTime: 0, location: [0, 0] }, targetWash: null, algorithm: 'state_aware', assignedAt: 0 },
      candidates: [
        { washId: 'overloaded', queueLength: 1, busyPosts: 2, totalPosts: 2, inTransit: 1, serviceTimeMin: WASHES[0]!.serviceTimeMin, rho: .98, expectedWaitMin: 12, travelTimeMin: 1 },
        { washId: 'stable', queueLength: 1, busyPosts: 1, totalPosts: 2, inTransit: 0, serviceTimeMin: WASHES[1]!.serviceTimeMin, rho: .5, expectedWaitMin: 2, travelTimeMin: 4 },
      ],
      now: 0,
      rng: mulberry32(1),
    });
    expect(decision.washId).toBe('stable');
  });

  it('алгоритмы возвращают null при пустом списке кандидатов', () => {
    for (const name of ['random', 'jsq', 'weighted_jsq', 'power_of_two', 'state_aware']) {
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
    expect(result.snapshots[0]!.time).toBe(0);
    const first = result.snapshots[0]!;
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
      const sa = a.snapshots[i]!;
      const sb = b.snapshots[i]!;
      expect(sa.time).toBe(sb.time);
      expect(sa.vehicles.map(v => v.phase)).toEqual(sb.vehicles.map(v => v.phase));
    }
  });

  it('пустой поток даёт один финальный снапшот', () => {
    const result = runSimulation(
      { washes: WASHES, config: makeConfig('jsq', 1), arrivals: [], recordSnapshots: true },
      (w, c, rng) => new Dispatcher(w, c, createAlgorithm(c.algorithm)),
    );
    expect(result.snapshots.length).toBe(1);
    expect(result.snapshots[0]!.time).toBe(0);
  });
});
