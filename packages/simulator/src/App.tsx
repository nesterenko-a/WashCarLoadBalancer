/**
 * Минимальный визуальный симулятор.
 * Запускает выбранный алгоритм и рисует карту + метрики.
 */

import { useMemo, useState } from 'react';
import {
  createAlgorithm,
  Dispatcher,
  generateArrivals,
  mulberry32,
  runSimulation,
  type CarWash,
  type SimConfig,
  type SimulationResult,
  type VehicleType,
} from '@loadbalancer/core';

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
  {
    id: 'wash_c',
    name: 'Мойка C',
    coordinates: [2000, 5000],
    posts: 2,
    serviceTimeMin: { sedan: 6, truck: 20, bus: 35 },
    supportedTypes: ['sedan'],
    isActive: true,
    schedule: { openHour: 0, closeHour: 24 },
  },
];

const TYPE_SHARES: Record<VehicleType, number> = { sedan: 0.6, truck: 0.3, bus: 0.1 };

function createArrivals(seed: number) {
  return generateArrivals(
    {
      lambdaBasePerMin: 0.25,
      horizonMin: 480,
      gridSizeMeters: 6000,
      typeShares: TYPE_SHARES,
    },
    mulberry32(seed),
  );
}

function run(seed: number, algorithm: string): SimulationResult {
  const config: SimConfig = {
    seed,
    algorithm,
    distanceMetric: 'manhattan',
    avgSpeedKmh: 20,
    timeScale: 1,
  };
  return runSimulation(
    { washes: WASHES, config, arrivals: createArrivals(seed) },
    (washes, cfg, rng) => new Dispatcher(washes, cfg, createAlgorithm(cfg.algorithm)),
  );
}

const ALGORITHMS = ['random', 'jsq', 'weighted_jsq'];

function objective(m: SimulationResult['metrics']): number {
  return 0.5 * m.avgWaitMin + 0.3 * m.avgTravelMin + 0.2 * m.cvRho;
}

export default function App() {
  const [seed, setSeed] = useState<number>(42);
  const [results, setResults] = useState<Record<string, SimulationResult> | null>(null);
  const [selected, setSelected] = useState<string>('weighted_jsq');

  const handleRun = () => {
    const next: Record<string, SimulationResult> = {};
    for (const algo of ALGORITHMS) {
      next[algo] = run(seed, algo);
    }
    setResults(next);
    setSelected('weighted_jsq');
  };

  const selectedResult = results ? results[selected] : null;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>Load Balancer — визуальное сравнение алгоритмов</h1>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
        <label>
          Seed:{' '}
          <input
            type="number"
            value={seed}
            onChange={e => setSeed(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
        <button onClick={handleRun}>▶ Запустить все три алгоритма</button>
      </div>

      {results && (
        <>
          <ComparisonTable results={results} />

          <div style={{ marginTop: 16, marginBottom: 8 }}>
            Карта для:{' '}
            {ALGORITHMS.map(algo => (
              <button
                key={algo}
                onClick={() => setSelected(algo)}
                style={{ marginRight: 8, fontWeight: selected === algo ? 'bold' : 'normal' }}
              >
                {algo}
              </button>
            ))}
          </div>

          {selectedResult && (
            <>
              <MapCanvas result={selectedResult} />
              <MetricsTable result={selectedResult} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ComparisonTable({ results }: { results: Record<string, SimulationResult> }) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 800 }}>
      <thead>
        <tr style={{ background: '#f3f4f6' }}>
          <th style={{ textAlign: 'left', padding: 8 }}>Алгоритм</th>
          <th style={{ textAlign: 'right', padding: 8 }}>Заявок</th>
          <th style={{ textAlign: 'right', padding: 8 }}>avg W_q</th>
          <th style={{ textAlign: 'right', padding: 8 }}>max W_q</th>
          <th style={{ textAlign: 'right', padding: 8 }}>SLA &gt;15</th>
          <th style={{ textAlign: 'right', padding: 8 }}>avg ρ</th>
          <th style={{ textAlign: 'right', padding: 8 }}>CV ρ</th>
          <th style={{ textAlign: 'right', padding: 8 }}>Jain</th>
          <th style={{ textAlign: 'right', padding: 8 }}>Objective</th>
        </tr>
      </thead>
      <tbody>
        {ALGORITHMS.map(algo => {
          const m = results[algo].metrics;
          return (
            <tr key={algo} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: 8 }}>{algo}</td>
              <td style={{ textAlign: 'right', padding: 8 }}>{m.totalRequests}</td>
              <td style={{ textAlign: 'right', padding: 8 }}>{m.avgWaitMin.toFixed(2)}</td>
              <td style={{ textAlign: 'right', padding: 8 }}>{m.maxWaitMin.toFixed(2)}</td>
              <td style={{ textAlign: 'right', padding: 8 }}>{(m.slaViolationRate * 100).toFixed(1)}%</td>
              <td style={{ textAlign: 'right', padding: 8 }}>{(m.avgRho * 100).toFixed(1)}%</td>
              <td style={{ textAlign: 'right', padding: 8 }}>{m.cvRho.toFixed(3)}</td>
              <td style={{ textAlign: 'right', padding: 8 }}>{m.jainFairness.toFixed(3)}</td>
              <td style={{ textAlign: 'right', padding: 8 }}>{objective(m).toFixed(3)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MetricsTable({ result }: { result: SimulationResult }) {
  const m = result.metrics;
  return (
    <table style={{ marginTop: 16, borderCollapse: 'collapse', width: '100%', maxWidth: 640 }}>
      <tbody>
        <tr><td>Всего заявок</td><td>{m.totalRequests}</td></tr>
        <tr><td>Отказов</td><td>{m.rejected} ({(m.rejectRate * 100).toFixed(1)}%)</td></tr>
        <tr><td>Среднее ожидание W_q</td><td>{m.avgWaitMin.toFixed(2)} мин</td></tr>
        <tr><td>Максимальное ожидание</td><td>{m.maxWaitMin.toFixed(2)} мин</td></tr>
        <tr><td>SLA-нарушения (&gt;15 мин)</td><td>{(m.slaViolationRate * 100).toFixed(1)}%</td></tr>
        <tr><td>Среднее время в пути</td><td>{m.avgTravelMin.toFixed(2)} мин</td></tr>
        <tr><td>Средняя загрузка ρ̄</td><td>{(m.avgRho * 100).toFixed(1)}%</td></tr>
        <tr><td>CV загрузки</td><td>{m.cvRho.toFixed(3)}</td></tr>
        <tr><td>Jain fairness</td><td>{m.jainFairness.toFixed(3)}</td></tr>
      </tbody>
    </table>
  );
}

function MapCanvas({ result }: { result: SimulationResult }) {
  return (
    <canvas
      ref={canvas => {
        if (!canvas || !result) return;
        drawMap(canvas, result);
      }}
      width={600}
      height={400}
      style={{ border: '1px solid #ccc', display: 'block' }}
    />
  );
}

function drawMap(canvas: HTMLCanvasElement, result: SimulationResult) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = 0.08; // метры -> пиксели
  const offsetX = 80;
  const offsetY = 60;

  // Границы территории
  ctx.strokeStyle = '#ddd';
  ctx.strokeRect(offsetX, offsetY, 6000 * scale, 6000 * scale);

  // Мойки
  for (const wash of WASHES) {
    const [x, y] = wash.coordinates;
    const px = offsetX + x * scale;
    const py = offsetY + y * scale;
    const wm = result.washMetrics[wash.id];

    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(px - 24, py - 24, 48, 48);
    ctx.strokeStyle = '#0284c7';
    ctx.strokeRect(px - 24, py - 24, 48, 48);

    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(wash.name, px, py - 28);
    ctx.fillText(`c=${wash.posts}`, px, py + 4);
    if (wm) {
      ctx.fillText(`ρ=${(wm.avgRho * 100).toFixed(0)}%`, px, py + 18);
      ctx.fillText(`L=${wm.avgQueueLength.toFixed(1)}`, px, py + 32);
    }
  }

  // Легенда
  ctx.textAlign = 'left';
  ctx.fillText(`Алгоритм: ${result.config.algorithm} | seed: ${result.config.seed}`, 10, 20);
}
