/**
 * Визуальный симулятор с playback и улучшенной Canvas-визуализацией.
 * Рисует дорожную сеть, здания моек с постами, очереди,
 * движение машин по дорогам и процесс мойки.
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
  type WashRequest,
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

  const lastFrameRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !activeResult) return;
    let rafId: number;
    const loop = (ts: number) => {
      if (lastFrameRef.current === null) lastFrameRef.current = ts;
      const dt = (ts - lastFrameRef.current) / 1000;
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
  const scores = useMemo(() => {
    const map: Record<AlgoName, number> = {} as Record<AlgoName, number>;
    for (const algo of ALGORITHMS) map[algo] = score(results[algo].metrics);
    return map;
  }, [results]);
  const bestAlgo = useMemo(() => {
    return ALGORITHMS.reduce((best, algo) => (scores[algo] < scores[best] ? algo : best));
  }, [scores]);

  return (
    <div>
      <p style={{ margin: '8px 0', fontSize: 13, color: '#475569' }}>
        Score = 0.5 × avg W_q + 0.3 × avg T_travel + 0.2 × CV_ρ (меньше — лучше)
      </p>
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
            <th style={{ textAlign: 'right', padding: 8 }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {ALGORITHMS.map(algo => {
            const m = results[algo].metrics;
            const isBest = algo === bestAlgo;
            return (
              <tr key={algo} style={{ borderBottom: '1px solid #e5e7eb', fontWeight: isBest ? 'bold' : 'normal', background: isBest ? '#ecfdf5' : undefined }}>
                <td style={{ padding: 8 }}>{algo}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{m.totalRequests}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{m.avgWaitMin.toFixed(2)}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{m.maxWaitMin.toFixed(2)}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{(m.slaViolationRate * 100).toFixed(1)}%</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{(m.avgRho * 100).toFixed(1)}%</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{m.cvRho.toFixed(3)}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{m.jainFairness.toFixed(3)}</td>
                <td style={{ textAlign: 'right', padding: 8 }}>{scores[algo].toFixed(3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function score(m: SimulationResult['metrics']): number {
  return 0.5 * m.avgWaitMin + 0.3 * m.avgTravelMin + 0.2 * m.cvRho;
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

  return <canvas ref={canvasRef} width={900} height={720} style={{ border: '1px solid #ccc', display: 'block', background: '#e5e7eb' }} />;
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

const COLORS: Record<VehicleType, string> = { sedan: '#2563eb', truck: '#d97706', bus: '#059669' };

function drawMap(canvas: HTMLCanvasElement, result: SimulationResult, currentTime: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = 0.1;
  const offsetX = 70;
  const offsetY = 60;
  const territorySize = 6000 * scale; // 600 px

  // Фон территории
  ctx.fillStyle = '#f0f4f8';
  ctx.fillRect(offsetX, offsetY, territorySize, territorySize);

  // Дорожная сеть
  drawRoads(ctx, WASHES, scale, offsetX, offsetY);

  const snapshot = findSnapshot(result.snapshots, currentTime);
  const washSnapById = new Map(snapshot?.washes.map(w => [w.washId, w]) ?? []);

  // Мойки с постами, очередью и машинами
  for (const wash of WASHES) {
    const ws = washSnapById.get(wash.id);
    drawWash(ctx, wash, ws, scale, offsetX, offsetY, result, currentTime);
  }

  // Легенда
  drawLegend(ctx, result, currentTime);
}

function drawRoads(
  ctx: CanvasRenderingContext2D,
  washes: readonly CarWash[],
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const territorySize = 6000 * scale;
  const xs = new Set<number>([0, 6000]);
  const ys = new Set<number>([0, 6000]);
  for (const w of washes) {
    xs.add(w.coordinates[0]);
    ys.add(w.coordinates[1]);
  }

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (const x of xs) {
    const px = offsetX + x * scale;
    ctx.beginPath();
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + territorySize);
    ctx.stroke();
  }
  for (const y of ys) {
    const py = offsetY + y * scale;
    ctx.beginPath();
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + territorySize, py);
    ctx.stroke();
  }

  // Разметка перекрёстков
  ctx.fillStyle = '#e2e8f0';
  for (const x of xs) {
    for (const y of ys) {
      const px = offsetX + x * scale;
      const py = offsetY + y * scale;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const SLOT_WIDTH = 34;
const SLOT_HEIGHT = 52;
const BUILDING_PADDING = 10;

function drawWash(
  ctx: CanvasRenderingContext2D,
  wash: CarWash,
  ws: { queueLength: number; busyPosts: number; inTransit: number; rho: number } | undefined,
  scale: number,
  offsetX: number,
  offsetY: number,
  result: SimulationResult,
  currentTime: number,
) {
  const [cx, cy] = wash.coordinates;
  const px = offsetX + cx * scale;
  const py = offsetY + cy * scale;

  const buildingWidth = wash.posts * SLOT_WIDTH + BUILDING_PADDING * 2;
  const buildingHeight = SLOT_HEIGHT + BUILDING_PADDING * 2;

  // Здание мойки
  ctx.fillStyle = '#e2e8f0';
  roundRect(ctx, px - buildingWidth / 2, py - buildingHeight / 2, buildingWidth, buildingHeight, 8);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  roundRect(ctx, px - buildingWidth / 2, py - buildingHeight / 2, buildingWidth, buildingHeight, 8);
  ctx.stroke();

  // Крыша
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.moveTo(px - buildingWidth / 2 - 6, py - buildingHeight / 2);
  ctx.lineTo(px, py - buildingHeight / 2 - 16);
  ctx.lineTo(px + buildingWidth / 2 + 6, py - buildingHeight / 2);
  ctx.closePath();
  ctx.fill();

  // Посты
  const busyCount = ws?.busyPosts ?? 0;
  for (let i = 0; i < wash.posts; i++) {
    const sx = px - buildingWidth / 2 + BUILDING_PADDING + i * SLOT_WIDTH;
    const sy = py - SLOT_HEIGHT / 2;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(sx, sy, SLOT_WIDTH - 4, SLOT_HEIGHT);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, SLOT_WIDTH - 4, SLOT_HEIGHT);

    // Занятый пост — машина внутри
    if (i < busyCount) {
      const request = findBusyVehicle(result, wash.id, currentTime, i);
      if (request) {
        drawVehicle(ctx, request.vehicle.type, [sx + (SLOT_WIDTH - 4) / 2, sy + SLOT_HEIGHT / 2], 10, request.vehicle.priority === 'urgent');
      } else {
        drawVehicle(ctx, 'sedan', [sx + (SLOT_WIDTH - 4) / 2, sy + SLOT_HEIGHT / 2], 10, false);
      }
    }
  }

  // Надпись и метрики
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(wash.name, px, py - buildingHeight / 2 - 22);
  ctx.font = '11px sans-serif';
  ctx.fillText(`c=${wash.posts} L=${ws?.queueLength ?? 0} t=${ws?.inTransit ?? 0}`, px, py + buildingHeight / 2 + 14);
  ctx.fillText(`ρ=${((ws?.rho ?? 0) * 100).toFixed(0)}%`, px, py + buildingHeight / 2 + 28);

  // Очередь слева от мойки
  const queueCount = ws?.queueLength ?? 0;
  for (let i = 0; i < queueCount; i++) {
    const request = findQueuedVehicle(result, wash.id, currentTime, i);
    const qx = px - buildingWidth / 2 - 18;
    const qy = py + buildingHeight / 2 + 16 + i * 14;
    drawVehicle(ctx, request?.vehicle.type ?? 'sedan', [qx, qy], 6, request?.vehicle.priority === 'urgent');
  }

  // Машины в пути (переопределяем позицию по дорожной сети)
  if (ws && ws.inTransit > 0) {
    const transitRequests = findTransitVehicles(result, wash.id, currentTime);
    for (const req of transitRequests) {
      const pos = roadPosition(req, currentTime, wash.coordinates);
      const px2 = offsetX + pos[0] * scale;
      const py2 = offsetY + pos[1] * scale;
      drawVehicle(ctx, req.vehicle.type, [px2, py2], 7, req.vehicle.priority === 'urgent');
    }
  }
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  type: VehicleType,
  center: [number, number],
  size: number,
  urgent: boolean,
) {
  const [x, y] = center;
  ctx.fillStyle = COLORS[type];
  if (type === 'sedan') {
    roundRect(ctx, x - size, y - size / 2, size * 2, size, 4);
    ctx.fill();
  } else if (type === 'truck') {
    ctx.fillRect(x - size, y - size / 2, size * 2.2, size);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + size * 0.3, y - size / 2, size * 0.4, size);
    ctx.fillStyle = COLORS[type];
  } else {
    // bus
    roundRect(ctx, x - size * 1.3, y - size / 2, size * 2.6, size, 4);
    ctx.fill();
  }

  if (urgent) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, size + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawLegend(ctx: CanvasRenderingContext2D, result: SimulationResult, currentTime: number) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`Алгоритм: ${result.config.algorithm} | seed: ${result.config.seed} | time: ${formatTime(currentTime)}`, 10, 20);

  const legendX = 10;
  let legendY = 42;
  const items: [VehicleType, string][] = [
    ['sedan', 'легковая'],
    ['truck', 'грузовая'],
    ['bus', 'автобус'],
  ];
  for (const [type, label] of items) {
    drawVehicle(ctx, type, [legendX + 10, legendY], 6, false);
    ctx.fillStyle = '#1e293b';
    ctx.font = '12px sans-serif';
    ctx.fillText(label, legendX + 26, legendY + 4);
    legendY += 20;
  }
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(legendX + 10, legendY, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#1e293b';
  ctx.fillText('срочная', legendX + 26, legendY + 4);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function roadPosition(req: WashRequest, currentTime: number, washCoord: [number, number]): [number, number] {
  const start = req.vehicle.location;
  const end = washCoord;
  const assignedAt = req.assignedAt;
  const arrivedAt = req.arrivedAt ?? assignedAt;
  const duration = Math.max(arrivedAt - assignedAt, 1e-6);
  const progress = Math.min(Math.max((currentTime - assignedAt) / duration, 0), 1);

  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const manhattan = Math.abs(dx) + Math.abs(dy);
  if (manhattan <= 0) return end;

  const horizShare = Math.abs(dx) / manhattan;
  if (progress < horizShare) {
    const p = progress / horizShare;
    return [start[0] + dx * p, start[1]];
  }
  const p = (progress - horizShare) / (1 - horizShare);
  return [end[0], start[1] + dy * p];
}

function findBusyVehicle(result: SimulationResult, washId: string, currentTime: number, postIndex: number): WashRequest | null {
  const req = result.requests.find(r => {
    if (r.targetWash !== washId) return false;
    if (r.startedAt === undefined || r.completedAt === undefined) return false;
    return r.startedAt <= currentTime && r.completedAt > currentTime;
  });
  return req ?? null;
}

function findQueuedVehicle(result: SimulationResult, washId: string, currentTime: number, queueIndex: number): WashRequest | null {
  const queue = result.requests.filter(r => {
    if (r.targetWash !== washId) return false;
    if (r.arrivedAt === undefined || r.startedAt === undefined) return false;
    return r.arrivedAt <= currentTime && r.startedAt > currentTime;
  });
  return queue[queueIndex] ?? null;
}

function findTransitVehicles(result: SimulationResult, washId: string, currentTime: number): WashRequest[] {
  return result.requests.filter(r => {
    if (r.targetWash !== washId) return false;
    if (r.assignedAt > currentTime) return false;
    if (r.arrivedAt !== undefined && r.arrivedAt <= currentTime) return false;
    return true;
  });
}
