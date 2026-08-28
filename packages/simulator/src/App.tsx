/**
 * Визуальный симулятор с playback.
 * Запускает три алгоритма, строит снапшоты и позволяет
 * проигрывать их с play/pause, слайдером и выбором скорости.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createAlgorithm,
  Dispatcher,
  generateArrivals,
  mulberry32,
  runSimulation,
  type CarWash,
  type SimConfig,
  type SimSnapshot,
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
const ALGORITHMS = ['random', 'jsq', 'weighted_jsq'] as const;

type AlgoName = (typeof ALGORITHMS)[number];

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
    { washes: WASHES, config, arrivals: createArrivals(seed), recordSnapshots: true },
    (washes, cfg, rng) => new Dispatcher(washes, cfg, createAlgorithm(cfg.algorithm)),
  );
}

function objective(m: SimulationResult['metrics']): number {
  return 0.5 * m.avgWaitMin + 0.3 * m.avgTravelMin + 0.2 * m.cvRho;
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  const s = Math.floor((min % 1) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function App() {
  const [seed, setSeed] = useState<number>(42);
  const [results, setResults] = useState<Record<AlgoName, SimulationResult> | null>(null);
  const [selected, setSelected] = useState<AlgoName>('weighted_jsq');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(10);

  const handleRun = () => {
    const next = {} as Record<AlgoName, SimulationResult>;
    for (const algo of ALGORITHMS) {
      next[algo] = run(seed, algo);
    }
    setResults(next);
    setSelected('weighted_jsq');
    setCurrentTime(0);
    setPlaying(false);
  };

  const activeResult = results?.[selected] ?? null;
  const maxTime = useMemo(() => {
    if (!activeResult) return 0;
    const snaps = activeResult.snapshots;
    return snaps.length > 0 ? snaps[snaps.length - 1].time : 0;
  }, [activeResult]);

  // playback loop
  const lastFrameRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !activeResult) return;
    let rafId: number;
    const loop = (ts: number) => {
      if (lastFrameRef.current === null) lastFrameRef.current = ts;
      const dt = (ts - lastFrameRef.current) / 1000; // seconds
      lastFrameRef.current = ts;
      setCurrentTime(prev => {
        const next = prev + dt * speed;
        return next >= maxTime ? maxTime : next;
      });
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      lastFrameRef.current = null;
    };
  }, [playing, activeResult, maxTime, speed]);

  // reset current time when switching algorithm
  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
  }, [selected]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>Load Balancer — визуальное сравнение алгоритмов</h1>

      <ControlBar
        seed={seed}
        onSeedChange={setSeed}
        onRun={handleRun}
        playing={playing}
        onTogglePlay={() => setPlaying(p => !p)}
        speed={speed}
        onSpeedChange={setSpeed}
        currentTime={currentTime}
        maxTime={maxTime}
        onTimeChange={setCurrentTime}
      />

      {results && (
        <>
          <ComparisonTable results={results} />

          <div style={{ marginTop: 16, marginBottom: 8 }}>
            Playback:{' '}
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

          {activeResult && (
            <>
              <MapCanvas result={activeResult} currentTime={currentTime} />
              <MetricsPanel result={activeResult} currentTime={currentTime} />
            </>
          )}
        </>
      )}
    </div>
  );
}

interface ControlBarProps {
  seed: number;
  onSeedChange: (v: number) => void;
  onRun: () => void;
  playing: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (v: number) => void;
  currentTime: number;
  maxTime: number;
  onTimeChange: (v: number) => void;
}

function ControlBar({
  seed,
  onSeedChange,
  onRun,
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  currentTime,
  maxTime,
  onTimeChange,
}: ControlBarProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, alignItems: 'center' }}>
      <label>
        Seed:{' '}
        <input type="number" value={seed} onChange={e => onSeedChange(Number(e.target.value))} style={{ width: 80 }} />
      </label>
      <button onClick={onRun}>▶ Запустить все три алгоритма</button>

      <button onClick={onTogglePlay} disabled={maxTime <= 0}>
        {playing ? '⏸ Pause' : '▶ Play'}
      </button>

      <label>
        Скорость:{' '}
        <select value={speed} onChange={e => onSpeedChange(Number(e.target.value))}>
          <option value={1}>1x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
          <option value={50}>50x</option>
        </select>
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 300 }}>
        <span>{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={maxTime || 1}
          step={0.1}
          value={currentTime}
          onChange={e => onTimeChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span>{formatTime(maxTime)}</span>
      </div>
    </div>
  );
}

function ComparisonTable({ results }: { results: Record<AlgoName, SimulationResult> }) {
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

function MetricsPanel({ result, currentTime }: { result: SimulationResult; currentTime: number }) {
  const snapshot = findSnapshot(result.snapshots, currentTime);
  const m = result.metrics;
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
      <div>
        <strong>Итоговые метрики</strong>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td>Всего заявок</td><td>{m.totalRequests}</td></tr>
            <tr><td>Отказов</td><td>{m.rejected} ({(m.rejectRate * 100).toFixed(1)}%)</td></tr>
            <tr><td>avg W_q</td><td>{m.avgWaitMin.toFixed(2)} мин</td></tr>
            <tr><td>max W_q</td><td>{m.maxWaitMin.toFixed(2)} мин</td></tr>
            <tr><td>SLA &gt;15</td><td>{(m.slaViolationRate * 100).toFixed(1)}%</td></tr>
            <tr><td>avg ρ</td><td>{(m.avgRho * 100).toFixed(1)}%</td></tr>
          </tbody>
        </table>
      </div>
      {snapshot && (
        <div>
          <strong>Состояние на {formatTime(snapshot.time)}</strong>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {snapshot.washes.map(w => (
                <tr key={w.washId}>
                  <td style={{ paddingRight: 16 }}>{w.name}</td>
                  <td style={{ paddingRight: 16 }}>L={w.queueLength}</td>
                  <td style={{ paddingRight: 16 }}>busy={w.busyPosts}/{w.posts}</td>
                  <td style={{ paddingRight: 16 }}>transit={w.inTransit}</td>
                  <td>ρ={(w.rho * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MapCanvas({ result, currentTime }: { result: SimulationResult; currentTime: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawMap(canvas, result, currentTime);
  }, [result, currentTime]);

  return <canvas ref={canvasRef} width={700} height={500} style={{ border: '1px solid #ccc', display: 'block' }} />;
}

function findSnapshot(snapshots: SimSnapshot[], time: number): SimSnapshot | null {
  if (snapshots.length === 0) return null;
  let idx = 0;
  for (let i = 0; i < snapshots.length; i++) {
    if (snapshots[i].time <= time) idx = i;
    else break;
  }
  return snapshots[idx];
}

const COLORS: Record<VehicleType, string> = { sedan: '#3b82f6', truck: '#f59e0b', bus: '#10b981' };

function drawMap(canvas: HTMLCanvasElement, result: SimulationResult, currentTime: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = 0.08;
  const offsetX = 90;
  const offsetY = 70;
  const territorySize = 6000 * scale;

  // Фон территории
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(offsetX, offsetY, territorySize, territorySize);
  ctx.strokeStyle = '#d1d5db';
  ctx.strokeRect(offsetX, offsetY, territorySize, territorySize);

  const snapshot = findSnapshot(result.snapshots, currentTime);

  // Мойки
  const washSnapById = new Map(snapshot?.washes.map(w => [w.washId, w]) ?? []);
  for (const wash of WASHES) {
    const [x, y] = wash.coordinates;
    const px = offsetX + x * scale;
    const py = offsetY + y * scale;
    const ws = washSnapById.get(wash.id);

    const size = 38 + wash.posts * 6;
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(px - size / 2, py - size / 2, size, size);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - size / 2, py - size / 2, size, size);

    ctx.fillStyle = '#000';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(wash.name, px, py - size / 2 - 8);
    ctx.fillText(`c=${wash.posts}`, px, py + 4);
    if (ws) {
      ctx.fillText(`L=${ws.queueLength} t=${ws.inTransit}`, px, py + 18);
      ctx.fillText(`ρ=${(ws.rho * 100).toFixed(0)}%`, px, py + 32);
    }

    // Занятые посты
    if (ws) {
      for (let i = 0; i < ws.busyPosts; i++) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(px - size / 2 + 4 + i * 8, py + size / 2 + 4, 6, 6);
      }
    }

    // Очередь — точки под мойкой
    const queueCount = ws?.queueLength ?? 0;
    for (let i = 0; i < queueCount; i++) {
      const qx = px - size / 2 + 6 + (i % 4) * 10;
      const qy = py + size / 2 + 18 + Math.floor(i / 4) * 10;
      ctx.fillStyle = '#6b7280';
      ctx.beginPath();
      ctx.arc(qx, qy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Машины
  if (snapshot) {
    for (const v of snapshot.vehicles) {
      const [vx, vy] = v.location;
      const px = offsetX + vx * scale;
      const py = offsetY + vy * scale;
      ctx.fillStyle = COLORS[v.type];
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      // обводка для срочных
      if (v.priority === 'urgent') {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // Легенда
  ctx.textAlign = 'left';
  ctx.fillStyle = '#000';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Алгоритм: ${result.config.algorithm} | seed: ${result.config.seed} | time: ${formatTime(currentTime)}`, 10, 20);

  let ly = 40;
  ctx.fillStyle = COLORS.sedan;
  ctx.beginPath(); ctx.arc(16, ly, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.fillText('sedan', 26, ly + 4); ly += 16;
  ctx.fillStyle = COLORS.truck;
  ctx.beginPath(); ctx.arc(16, ly, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.fillText('truck', 26, ly + 4); ly += 16;
  ctx.fillStyle = COLORS.bus;
  ctx.beginPath(); ctx.arc(16, ly, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.fillText('bus', 26, ly + 4); ly += 16;
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(16, ly, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#000'; ctx.fillText('urgent', 26, ly + 4);
}
