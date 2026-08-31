/**
 * Оболочка симулятора по макету maket1.
 *
 * Будущие алгоритмы и типы потока показаны отключёнными: они будут активированы
 * после реализации в core, чтобы UI не имитировал несуществующую функциональность.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createAlgorithm, createRoadGraphPlanner, Dispatcher, generateArrivals, mulberry32, runSimulation, type CarWash, type RoadGraph, type SimConfig, type SimSnapshot, type SimulationResult, type VehicleSource, type VehicleType } from '@loadbalancer/core';
import './App.css';

const WASHES: CarWash[] = [
  { id: 'wash_a', name: 'Мойка A', coordinates: [700, 1800], posts: 4, serviceTimeMin: { sedan: 8, truck: 25, heavy_truck: 38, bus: 40 }, supportedTypes: ['sedan', 'truck'], isActive: true, schedule: { openHour: 0, closeHour: 24 } },
  { id: 'wash_b', name: 'Мойка B', coordinates: [5000, 750], posts: 3, serviceTimeMin: { sedan: 10, truck: 30, heavy_truck: 45, bus: 40 }, supportedTypes: ['sedan', 'truck', 'heavy_truck', 'bus'], isActive: true, schedule: { openHour: 0, closeHour: 24 } },
  { id: 'wash_e', name: 'Мойка E', coordinates: [5250, 3900], posts: 5, serviceTimeMin: { sedan: 7, truck: 22, heavy_truck: 35, bus: 36 }, supportedTypes: ['sedan', 'truck', 'heavy_truck', 'bus'], isActive: true, schedule: { openHour: 0, closeHour: 24 } },
];
const shares: Record<VehicleType, number> = { sedan: .55, truck: .22, heavy_truck: .08, bus: .15 };
/** Источники отражают схему road.txt: въезд и два внутренних цеха. */
const SOURCES: VehicleSource[] = [
  { id: 'entrance', name: 'Въезд с основной дороги', kind: 'entrance', coordinates: [3000, 5700] },
  { id: 'shop_1', name: 'Цех №1', kind: 'workshop', coordinates: [3750, 140] },
  { id: 'shop_2', name: 'Цех №2', kind: 'workshop', coordinates: [1800, 3100] },
  { id: 'shop_3', name: 'Цех №3', kind: 'workshop', coordinates: [4000, 2800] },
];
const ROAD_GRAPH: RoadGraph = {
  nodes: [
    ...SOURCES.map(source => ({ id: source.id, coordinates: source.coordinates })),
    { id: 'center', coordinates: [3000, 3200] }, { id: 'upper', coordinates: [3000, 900] },
    { id: 'a_turn', coordinates: [3000, 1700] }, { id: 'b_turn', coordinates: [4400, 900] }, { id: 'e_turn', coordinates: [4100, 3700] },
    { id: 'wash_a', coordinates: [700, 1800] }, { id: 'wash_b', coordinates: [5000, 750] }, { id: 'wash_e', coordinates: [5250, 3900] },
  ],
  edges: [
    { from: 'entrance', to: 'center' }, { from: 'shop_2', to: 'center' }, { from: 'shop_3', to: 'center' },
    { from: 'center', to: 'upper' }, { from: 'upper', to: 'a_turn' }, { from: 'a_turn', to: 'wash_a' },
    { from: 'upper', to: 'shop_1' }, { from: 'upper', to: 'b_turn' }, { from: 'b_turn', to: 'wash_b' },
    { from: 'shop_3', to: 'e_turn' }, { from: 'e_turn', to: 'wash_e' },
  ],
};
const routePlanner = createRoadGraphPlanner(ROAD_GRAPH);
const algorithms = ['random', 'jsq', 'weighted_jsq'] as const;
type Algorithm = typeof algorithms[number];
const labels: Record<Algorithm, string> = { random: 'Random', jsq: 'JSQ — Shortest Queue', weighted_jsq: 'Weighted JSQ' };
const colors: Record<string, string> = { wash_a: '#2879df', wash_b: '#39a967', wash_e: '#e64d58' };
function formatTime(minutes: number) { const h = Math.floor(minutes / 60); const m = Math.floor(minutes % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`; }
function run(seed: number, algorithm: Algorithm, lambda: number, horizon: number) {
  const config: SimConfig = { seed, algorithm, distanceMetric: 'manhattan', avgSpeedKmh: 20, timeScale: 1 };
  const arrivals = generateArrivals({ lambdaBasePerMin: lambda, horizonMin: horizon, gridSizeMeters: 6000, typeShares: shares, sources: SOURCES }, mulberry32(seed));
  return runSimulation({ washes: WASHES, config, arrivals, recordSnapshots: true, routePlanner }, (w, c) => new Dispatcher(w, c, createAlgorithm(c.algorithm), routePlanner));
}
function getSnapshot(result: SimulationResult, time: number) { return result.snapshots.reduce<SimSnapshot | undefined>((last, value) => value.time <= time ? value : last, undefined); }
/**
 * В snapshot пока нет значения Erlang C Wq. До расширения контракта
 * SimSnapshot UI показывает только наглядную оценку очереди; это не KPI.
 */
function visualWait(wash: CarWash, state?: SimSnapshot['washes'][number]) {
  return ((state?.queueLength ?? 0) / Math.max(wash.posts, 1)) * wash.serviceTimeMin.sedan;
}

export default function App() {
  const [seed, setSeed] = useState(42); const [lambda, setLambda] = useState(.5); const [horizon, setHorizon] = useState(120);
  const [selected, setSelected] = useState<Algorithm>('jsq'); const [results, setResults] = useState<Record<Algorithm, SimulationResult> | null>(null);
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(10);
  const [visibility, setVisibility] = useState({ roads: true, posts: true, queues: true, values: true });
  const active = results?.[selected]; const maxTime = active?.snapshots.at(-1)?.time ?? 0;
  const snapshot = useMemo(() => active && getSnapshot(active, time), [active, time]);
  const activeDecision = useMemo(() => active ? [...active.decisions].reverse().find(item => item.time <= time) : undefined, [active, time]);
  const focusRequest = activeDecision ? active?.requests.find(item => item.id === activeDecision.requestId) : undefined;
  const start = () => { const next = {} as Record<Algorithm, SimulationResult>; algorithms.forEach(a => next[a] = run(seed, a, lambda, horizon)); setResults(next); setTime(0); setPlaying(true); };
  const animation = useRef<number>();
  useEffect(() => { if (!playing || !active) return; let last = performance.now(); const loop = (now: number) => { setTime(old => { const next = Math.min(maxTime, old + (now - last) / 1000 * speed); if (next === maxTime) setPlaying(false); return next; }); last = now; animation.current = requestAnimationFrame(loop); }; animation.current = requestAnimationFrame(loop); return () => { if (animation.current) cancelAnimationFrame(animation.current); }; }, [active, maxTime, playing, speed]);
  const metrics = active?.metrics;
  return <div className="app">
    <header><h1>Симулятор распределения нагрузки между автомойками</h1><div className="header-controls">
      <label>Балансировщик <select value={selected} onChange={e => { setSelected(e.target.value as Algorithm); setTime(0); }}><option value="jsq">{labels.jsq}</option><option value="weighted_jsq">{labels.weighted_jsq}</option><option value="random">{labels.random}</option><option disabled>Power of Two Choices — скоро</option><option disabled>Round Robin — скоро</option></select></label>
      <button className="primary" onClick={start}>▶ Запуск</button><button disabled={!active} onClick={() => setPlaying(v => !v)}>{playing ? '❚❚ Пауза' : '▶ Продолжить'}</button><button onClick={() => { setTime(0); setPlaying(false); }}>↻ Сброс</button>
    </div></header>
    <main><aside className="sidebar"><Panel title="Настройки симуляции">
      <Field label="Длительность" value={formatTime(horizon)}><input type="number" min="30" max="1440" value={horizon} onChange={e => setHorizon(Number(e.target.value))}/></Field>
      <Field label="Шаг воспроизведения" value={`${speed} мин/с`}><select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="1">1 мин/с</option><option value="10">10 мин/с</option><option value="50">50 мин/с</option></select></Field>
      <Field label="Поток машин (λ)" value={`${(lambda * 60).toFixed(0)} машин/час`}><input className="range" type="range" min=".1" max="1.5" step=".1" value={lambda} onChange={e => setLambda(Number(e.target.value))}/></Field>
      <label className="select-field">Тип потока<select defaultValue="poisson"><option value="poisson">Пуассоновский</option><option disabled>Равномерный — скоро</option><option disabled>Пиковый — скоро</option><option disabled>Исторические данные — скоро</option></select></label>
      <label className="check"><input type="checkbox" checked readOnly/>Учитывать расстояние <span title="Отключение требует параметра в алгоритмах core.">ⓘ</span></label>
    </Panel><Panel title="Отображение">{(['roads', 'posts', 'queues', 'values'] as const).map(key => <label className="check" key={key}><input type="checkbox" checked={visibility[key]} onChange={e => setVisibility({ ...visibility, [key]: e.target.checked })}/>{{ roads:'Показывать дороги', posts:'Показывать посты', queues:'Показывать очереди', values:'Показывать значения' }[key]}</label>)}</Panel>
    <Panel title="Типы машин"><VehicleLegend/></Panel><Panel title="Метрики системы (итог)"><Metric text="Обслужено машин" value={metrics ? String(metrics.completed) : '—'}/><Metric text="Среднее время ожидания" value={metrics ? `${metrics.avgWaitMin.toFixed(1)} мин` : '—'}/><Metric text="Средняя длина очереди" value={metrics ? (Object.values(active?.washMetrics ?? {}).reduce((sum, wash) => sum + wash.avgQueueLength, 0) / WASHES.length).toFixed(1) : '—'}/><Metric text="Загрузка системы (ρ)" value={metrics ? `${(metrics.avgRho * 100).toFixed(0)}%` : '—'}/><Metric text="Поток машин (λ)" value={`${(lambda * 60).toFixed(1)}/час`}/></Panel></aside>
    <section className="center"><div className="map"><Map snapshot={snapshot} visibility={visibility} route={focusRequest?.route}/>{!active && <div className="empty">Выберите алгоритм и нажмите «Запуск»</div>}</div>{active && <Decision result={active} decision={activeDecision}/>}<input className="timeline" type="range" min="0" max={maxTime || 1} step=".1" value={time} disabled={!active} onChange={e => setTime(Number(e.target.value))}/><div className="time-label"><span>{formatTime(time)}</span><span>{formatTime(maxTime)}</span></div>{active && <Table result={active} snapshot={snapshot}/>}</section>
    <aside className="right"><Panel title="Загрузка автомоек (ρ)">{WASHES.map(w => <Bar key={w.id} label={w.name.at(-1)!} value={snapshot?.washes.find(s => s.washId === w.id)?.rho ?? 0} color={colors[w.id]}/>)}</Panel><Panel title="Среднее время ожидания (Wq), мин"><Chart result={active} field="wait"/><Legend/></Panel><Panel title="Очереди (кол-во машин)"><Chart result={active} field="queue"/><Legend/></Panel></aside></main></div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Field({ label, value, children }: { label: string; value: string; children: React.ReactNode }) { return <label className="field"><span>{label}<b>{value}</b></span>{children}</label>; }
function Metric({ text, value }: { text: string; value: string }) { return <div className="metric"><span>{text}</span><b>{value}</b></div>; }
function Bar({ label, value, color }: { label: string; value: number; color: string }) { return <div className="bar"><span>{label}</span><div><i style={{ width: `${Math.min(value, 1) * 100}%`, background: color }}/></div><b>{value.toFixed(2)}</b></div>; }
function Legend() { return <div className="legend">{WASHES.map(w => <span key={w.id}><i style={{ background: colors[w.id] }}/>{w.name.at(-1)}</span>)}</div>; }
function Map({ snapshot, visibility, route }: { snapshot?: SimSnapshot; visibility: Record<'roads' | 'posts' | 'queues' | 'values', boolean>; route?: { points: { coordinates: [number, number] }[] } }) { return <div className="factory">{visibility.roads && <RoadNetwork/>}{route && <svg viewBox="0 0 6000 6000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none' }}><polyline points={route.points.map(point => point.coordinates.join(',')).join(' ')} fill="none" stroke="#ffd166" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/></svg>}{SOURCES.map(source => <div className="source" key={source.id} style={{ left: source.coordinates[0] / 60 + '%', top: source.coordinates[1] / 60 + '%', transform: 'translate(-50%, -50%)', zIndex: 5 }}><b>{source.kind === 'entrance' ? '↥' : '▰'} {source.name}</b><small>{source.kind === 'entrance' ? 'поток снаружи' : 'внутренний поток'}</small></div>)}{snapshot?.vehicles.filter(vehicle => vehicle.phase === 'transit').map(vehicle => <VehicleGlyph key={vehicle.id} type={vehicle.type} priority={vehicle.priority} style={{ position: 'absolute', zIndex: 7, left: vehicle.location[0] / 60 + '%', top: vehicle.location[1] / 60 + '%', transform: 'translate(-50%, -50%)' }}/>) }{WASHES.map((wash, index) => <Wash key={wash.id} wash={wash} snapshot={snapshot} state={snapshot?.washes.find(s => s.washId === wash.id)} color={colors[wash.id]} pos={index} visibility={visibility}/>)}</div>; }
function RoadNetwork() { return <svg viewBox="0 0 6000 6000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }}>{ROAD_GRAPH.edges.map(edge => { const from = ROAD_GRAPH.nodes.find(node => node.id === edge.from)!; const to = ROAD_GRAPH.nodes.find(node => node.id === edge.to)!; return <line key={edge.from + edge.to} x1={from.coordinates[0]} y1={from.coordinates[1]} x2={to.coordinates[0]} y2={to.coordinates[1]} stroke="#343b43" strokeWidth="150" strokeLinecap="round"/>; })}{ROAD_GRAPH.edges.map(edge => { const from = ROAD_GRAPH.nodes.find(node => node.id === edge.from)!; const to = ROAD_GRAPH.nodes.find(node => node.id === edge.to)!; return <line key={'mark' + edge.from + edge.to} x1={from.coordinates[0]} y1={from.coordinates[1]} x2={to.coordinates[0]} y2={to.coordinates[1]} stroke="#e8eef5" strokeWidth="10" strokeDasharray="44 38" opacity=".75"/>; })}<circle cx="3000" cy="3200" r="150" fill="#343b43" stroke="#e8eef5" strokeWidth="25"/></svg>; }
function Wash({ wash, snapshot, state, color, visibility }: { wash: CarWash; snapshot?: SimSnapshot; state?: SimSnapshot['washes'][number]; color: string; pos: number; visibility: Record<'roads' | 'posts' | 'queues' | 'values', boolean> }) { const rho = state?.rho ?? 0; const busy = snapshot?.vehicles.filter(vehicle => vehicle.targetWashId === wash.id && vehicle.phase === 'busy') ?? []; const queued = snapshot?.vehicles.filter(vehicle => vehicle.targetWashId === wash.id && vehicle.phase === 'queued') ?? []; return <article className="wash" style={{ '--wash': color, left: wash.coordinates[0] / 60 + '%', top: wash.coordinates[1] / 60 + '%', transform: 'translate(-50%, -50%)', zIndex: 6 } as React.CSSProperties}><header><b>▥ &nbsp;{wash.name}</b><span>Посты (c): {wash.posts}</span></header><div className="wash-body">{visibility.queues && <div className="queue"><b>Очередь ({state?.queueLength ?? 0})</b><div>{queued.slice(0, 6).map(vehicle => <VehicleGlyph key={vehicle.id} type={vehicle.type} priority={vehicle.priority} compact/>)}</div></div>}{visibility.posts && <div className="posts"><b>Посты</b><div>{Array.from({ length: wash.posts }, (_, i) => <i key={i} style={{ display: 'grid', placeItems: 'center', background: '#101e2e', border: '1px solid #607286' }}>{busy[i] && <VehicleGlyph type={busy[i].type} priority={busy[i].priority} compact/>}</i>)}</div></div>}{visibility.values && <div className="stats"><span>μ<b>{(60 / wash.serviceTimeMin.sedan).toFixed(1)}</b><small>маш/ч</small></span><span>λ<b>{(rho * wash.posts * 60 / wash.serviceTimeMin.sedan).toFixed(1)}</b><small>маш/ч</small></span><span>ρ<b className={rho > .9 ? 'danger' : ''}>{rho.toFixed(2)}</b></span><span title="Визуальная оценка, не Erlang C"><b>{visualWait(wash, state).toFixed(1)}</b><small>Wq*</small></span></div>}</div></article>; }
function VehicleGlyph({ type, priority, compact, style }: { type: VehicleType; priority: 'urgent' | 'normal' | 'scheduled'; compact?: boolean; style?: React.CSSProperties }) { const size = compact ? { sedan: [22, 14], truck: [27, 16], heavy_truck: [31, 18], bus: [32, 18] } : { sedan: [21, 12], truck: [29, 14], heavy_truck: [35, 16], bus: [38, 16] }; const pair = size[type]; const palette: Record<VehicleType, string> = { sedan: '#3487ee', truck: '#f0a329', heavy_truck: '#8b5cf6', bus: '#39b56d' }; return <i title={{ sedan: 'Легковая', truck: 'Грузовая', heavy_truck: 'Тяжёлый грузовик', bus: 'Автобус' }[type] + (priority === 'urgent' ? ' · срочная' : '')} style={{ display: 'inline-block', flex: 'none', width: pair[0], height: pair[1], borderRadius: type === 'bus' ? 3 : 6, background: palette[type], border: priority === 'urgent' ? '3px solid #ff4555' : '1px solid #e8eef5', boxShadow: priority === 'urgent' ? '0 0 9px #ff4555' : '0 1px 3px #0007', ...style }}/>; }
function VehicleLegend() { return <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>{([{ type: 'sedan', name: 'Легковая' }, { type: 'truck', name: 'Грузовая' }, { type: 'heavy_truck', name: 'Тяжёлый грузовик' }, { type: 'bus', name: 'Автобус' }] as { type: VehicleType; name: string }[]).map(item => <span key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><VehicleGlyph type={item.type} priority="normal"/>{item.name}</span>)}<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><VehicleGlyph type="sedan" priority="urgent"/>Срочный приоритет</span></div>; }
function Table({ result, snapshot }: { result: SimulationResult; snapshot?: SimSnapshot }) { return <section className="table-panel"><h2>Сводная таблица по автомойкам</h2><table><thead><tr><th>Мойка</th><th>Посты (c)</th><th>μ (маш/ч)</th><th>λ (маш/ч)</th><th>ρ</th><th>Wq* (мин)</th><th>Очередь</th><th>Обслужено</th></tr></thead><tbody>{WASHES.map(w => { const s = snapshot?.washes.find(x => x.washId === w.id); return <tr key={w.id}><td><i className="badge" style={{ background: colors[w.id] }}>{w.name.at(-1)}</i></td><td>{w.posts}</td><td>{(60 / w.serviceTimeMin.sedan).toFixed(1)}</td><td>{((s?.rho ?? 0) * w.posts * 60 / w.serviceTimeMin.sedan).toFixed(1)}</td><td>{(s?.rho ?? 0).toFixed(2)}</td><td title="Визуальная оценка, не Erlang C">{visualWait(w, s).toFixed(1)}</td><td>{s?.queueLength ?? 0}</td><td>{result.washMetrics[w.id]?.completed ?? 0}</td></tr>; })}</tbody></table></section>; }
function Decision({ result, decision }: { result: SimulationResult; decision: SimulationResult['decisions'][number] | undefined }) {
  if (!decision) return <div className="decision">Ожидание первой заявки…</div>;
  const request = result.requests.find(item => item.id === decision.requestId);
  const source = request?.vehicle.source?.name ?? 'неизвестный источник';
  return <div className="decision"><div><b>{source}</b><span> → Balancer рассмотрел доступные мойки; жёлтая линия показывает выбранный маршрут.</span></div><div style={{ display: 'flex', gap: 7, width: '100%' }}>{decision.candidates.map(candidate => { const wash = WASHES.find(item => item.id === candidate.washId); const chosen = candidate.washId === decision.chosenWash; return <div key={candidate.washId} style={{ flex: 1, padding: 8, border: chosen ? '2px solid #ffd166' : '1px solid #33475d', borderRadius: 5, background: chosen ? '#4a3c1633' : '#101f31' }}><b style={{ color: colors[candidate.washId] }}>{wash?.name ?? candidate.washId}{chosen ? ' ✓' : ''}</b><small style={{ display: 'block', marginTop: 4 }}>Путь {candidate.travelTimeMin.toFixed(1)} мин · Wq {candidate.expectedWaitMin.toFixed(1)} мин</small><strong style={{ display: 'block', marginTop: 4 }}>Score {candidate.score.toFixed(2)}</strong></div>; })}</div></div>;
}
function Chart({ result, field }: { result?: SimulationResult; field: 'wait' | 'queue' }) { if (!result) return <div className="chart empty-chart">Данные появятся после запуска</div>; const points = result.snapshots.filter((_, i) => i % Math.max(1, Math.floor(result.snapshots.length / 30)) === 0); const max = Math.max(1, ...points.flatMap(s => s.washes.map(w => field === 'wait' ? visualWait(WASHES.find(x => x.id === w.washId)!, w) : w.queueLength))); return <svg className="chart" viewBox="0 0 260 110" preserveAspectRatio="none">{WASHES.map(w => <polyline key={w.id} fill="none" stroke={colors[w.id]} strokeWidth="2" points={points.map((s,i) => { const v=s.washes.find(x=>x.washId===w.id); const n=field==='wait'?visualWait(w, v):v?.queueLength??0; return `${i/Math.max(points.length-1,1)*260},${105-n/max*90}`; }).join(' ')}/>)}</svg>; }
