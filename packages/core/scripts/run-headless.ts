/**
 * Headless-прогон симуляции для сравнения алгоритмов.
 * Использует node:fs — скрипт вне экспортируемой библиотеки packages/core/src (NF-11).
 */

import { writeFileSync } from 'node:fs';
import {
  createAlgorithm,
  Dispatcher,
  generateArrivals,
  mulberry32,
  runSimulation,
  type CarWash,
  type SimConfig,
  type VehicleType,
} from '../src/index.js';

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

const TYPE_SHARES: Record<VehicleType, number> = {
  sedan: 0.55,
  truck: 0.22,
  heavy_truck: 0.08,
  bus: 0.15,
};

function makeConfig(algorithm: string, seed: number): SimConfig {
  return {
    seed,
    algorithm,
    distanceMetric: 'manhattan',
    avgSpeedKmh: 20,
    timeScale: 1,
  };
}

function objective(metrics: { avgWaitMin: number; avgTravelMin: number; cvRho: number }): number {
  return 0.5 * metrics.avgWaitMin + 0.3 * metrics.avgTravelMin + 0.2 * metrics.cvRho;
}

function run(algorithm: string, seed: number) {
  const config = makeConfig(algorithm, seed);
  const arrivals = generateArrivals(
    {
      lambdaBasePerMin: 0.25,
      horizonMin: 8 * 60,
      gridSizeMeters: 6000,
      typeShares: TYPE_SHARES,
    },
    mulberry32(seed),
  );
  const result = runSimulation(
    { washes: WASHES, config, arrivals },
    (washes, cfg, rng) => new Dispatcher(washes, cfg, createAlgorithm(cfg.algorithm)),
  );
  return result;
}

const algorithms = ['random', 'jsq', 'weighted_jsq'];
const seed = Number(process.argv[2]) || 42;

console.log(`Seed: ${seed}\n`);
console.log('| algorithm      | total | rejected | avgWait | maxWait | SLA>15 | avgRho | CV_rho | objective |');
console.log('|----------------|-------|----------|---------|---------|--------|--------|--------|----------|');

for (const algo of algorithms) {
  const result = run(algo, seed);
  const m = result.metrics;
  const obj = objective({ avgWaitMin: m.avgWaitMin, avgTravelMin: m.avgTravelMin, cvRho: m.cvRho });
  console.log(
    `| ${algo.padEnd(14)} | ${m.totalRequests.toString().padStart(5)} | ${m.rejected.toString().padStart(8)} | ` +
    `${m.avgWaitMin.toFixed(2).padStart(7)} | ${m.maxWaitMin.toFixed(2).padStart(7)} | ` +
    `${(m.slaViolationRate * 100).toFixed(1).padStart(6)}% | ${m.avgRho.toFixed(2).padStart(6)} | ` +
    `${m.cvRho.toFixed(2).padStart(6)} | ${obj.toFixed(3).padStart(8)} |`,
  );

  const csvLines = [
    'timestamp,request_id,vehicle_type,priority,algorithm,chosen_wash,scores,rejected_reason',
    ...result.decisions.map(d =>
      `${d.time},${d.requestId},${d.vehicleType},${d.priority},${d.algorithm},${d.chosenWash ?? ''},"${JSON.stringify(d.scores)}",${d.rejectedReason}`,
    ),
  ];
  writeFileSync(`decisions-${algo}.csv`, csvLines.join('\n'));
}
